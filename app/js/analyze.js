/* ── LogScope: baselines, crash detection, insights ─────────── */
window.LS = window.LS || {};

function mean(arr) {
  let s = 0, n = 0;
  for (const v of arr) if (Number.isFinite(v)) { s += v; n++; }
  return n ? s / n : NaN;
}

/** Per-load-zone averages/peaks for one metric → baseline comparison. */
LS.perZoneStats = function perZoneStats(ds, zoneInfo, metricKey) {
  const m = ds.metrics[metricKey];
  const out = {};
  for (const z of LS.LOAD_ZONES) out[z.key] = { vals: [], avg: NaN, max: NaN, count: 0 };
  if (!m) return out;
  for (let i = 0; i < ds.sampleCount; i++) {
    const z = zoneInfo.zones[i];
    if (!z) continue;
    const v = m.values[i];
    if (!Number.isFinite(v)) continue;
    out[z].vals.push(v);
  }
  for (const z of LS.LOAD_ZONES) {
    const b = out[z.key];
    b.count = b.vals.length;
    if (b.count) { b.avg = mean(b.vals); b.max = Math.max(...b.vals); }
    delete b.vals;
  }
  return out;
};

function tailSize(n) { return Math.max(5, Math.min(20, Math.round(n * 0.05))); }
function tailFinite(v, w) { return v.slice(-w).filter(Number.isFinite); }
function lastFinite(v) { for (let i = v.length - 1; i >= 0; i--) if (Number.isFinite(v[i])) return v[i]; return NaN; }

/**
 * Detect a GPU hang/crash. Two honest signatures:
 *   'dropout' — GPU sensors stop reporting (NaN) while the CPU keeps logging.
 *   'freeze'  — GPU load/power/temp/FPS flatline at the tail after moving,
 *               and the activity signal collapses to ~0 (frozen frame).
 * If neither, but the log ends while the GPU is still busy, we report
 * 'endedUnderLoad' (crashed=false) — the logger was cut off mid-load.
 */
LS.detectCrash = function detectCrash(ds) {
  const n = ds.sampleCount;
  const w = tailSize(n);
  const signalKeys = ['gpuClock', 'gpuLoad', 'gpuPower', 'gpuTemp', 'gpuJunction', 'fps'];
  const signals = signalKeys.map((k) => ds.metrics[k]).filter(Boolean);
  if (!signals.length || n < 12) return { crashed: false, kind: null };

  let frozen = 0, dropout = 0, crashIndex = -1;
  for (const m of signals) {
    const v = m.values;
    if (m.stats.max === m.stats.min) continue; // never varied → ignore
    const finite = tailFinite(v, w);
    if (finite.length < Math.max(3, w * 0.5)) {
      dropout++;
      const li = findLastFiniteIndex(v);
      if (li > crashIndex) crashIndex = li;
      continue;
    }
    const rTail = Math.max(...finite) - Math.min(...finite);
    const rOverall = m.stats.max - m.stats.min;
    if (rTail <= Math.max(1e-9, 0.02 * rOverall)) {
      frozen++;
      const lc = findLastChangeIndex(v);
      if (lc > crashIndex) crashIndex = lc;
    }
  }

  // Activity signal collapse (load/fps/power near zero at the tail).
  const act = ds.metrics.gpuLoad || ds.metrics.fps || ds.metrics.gpuPower;
  let collapsed = false, endedUnderLoad = false;
  if (act) {
    const t = tailFinite(act.values, w);
    const tAvg = t.length ? t.reduce((a, b) => a + b, 0) / t.length : NaN;
    if (act.stats.max > 0) {
      collapsed = Number.isFinite(tAvg) && tAvg <= act.stats.max * 0.05;
      const last = lastFinite(act.values);
      endedUnderLoad = Number.isFinite(last) && last >= act.stats.max * 0.25;
    }
  }

  // CPU still updating through the tail? (PC-alive vs full lockup.)
  let cpuAlive = null;
  const cpu = ds.metrics.cpuLoad || ds.metrics.cpuPower || ds.metrics.cpuTemp;
  if (cpu) {
    const t = tailFinite(cpu.values, w);
    cpuAlive = t.length >= 3 && (Math.max(...t) - Math.min(...t)) > 0.5;
  }

  const mk = (kind, idx) => ({
    crashed: kind === 'dropout' || kind === 'freeze',
    kind,
    index: idx,
    time: ds.times[idx] || '',
    cpuAlive, frozenSignals: frozen, dropoutSignals: dropout,
  });

  if (dropout >= 2) return mk('dropout', crashIndex >= 0 ? crashIndex : n - w);
  if (frozen >= 3 && collapsed) return mk('freeze', crashIndex >= 0 ? crashIndex : n - w);
  if (endedUnderLoad) return mk('endedUnderLoad', n - 1);
  return { crashed: false, kind: null };
};

function findLastChangeIndex(v) {
  for (let i = v.length - 1; i > 0; i--) {
    if (Number.isFinite(v[i]) && Number.isFinite(v[i - 1]) && v[i] !== v[i - 1]) return i;
  }
  return -1;
}
function findLastFiniteIndex(v) {
  for (let i = v.length - 1; i >= 0; i--) if (Number.isFinite(v[i])) return i;
  return -1;
}

/** Build the ordered list of insight cards. */
LS.buildInsights = function buildInsights(ds, zoneInfo, crash) {
  const out = [];
  const add = (severity, title, desc) => out.push({ severity, title, desc });
  const M = ds.metrics;

  // 1. Crash / hang signature.
  const at = crash.time ? `~${crash.time.split('.')[0]}` : 'the end of the log';
  if (crash.kind === 'dropout') {
    let desc = `GPU sensors <strong>stopped reporting</strong> near <strong>${at}</strong> while the rest of the log kept going — HWiNFO could no longer read the card.`;
    if (crash.cpuAlive === true) desc += ' The <strong>CPU kept logging</strong> through it, so the PC stayed alive while the GPU dropped off the bus — a hard GPU hang, not heat or software.';
    add('critical', 'GPU stopped responding', desc);
  } else if (crash.kind === 'freeze') {
    const sev = crash.cpuAlive === true ? 'critical' : 'warn';
    let desc = `Just before the log ends (<strong>${at}</strong>), GPU load, power, temperature and framerate <strong>flatlined</strong> after moving normally — a frozen-frame signature.`;
    if (crash.cpuAlive === true) desc += ' The <strong>CPU kept updating</strong> through the freeze, so the machine stayed alive while the GPU locked — the classic hardware hang.';
    desc += ' <em>Caveat: if you just stopped logging after the GPU went idle, this can be a false alarm — confirm the timestamp in Event Viewer.</em>';
    add(sev, 'GPU froze at end of log', desc);
  } else if (crash.kind === 'endedUnderLoad') {
    add('warn', 'Log ended mid-load',
      `The log stops abruptly at <strong>${at}</strong> while the GPU was still under load, with no wind-down. If a crash happened here it killed HWiNFO too — which is itself consistent with a hard crash or reboot. Cross-check the time in Event Viewer / Reliability Monitor.`);
  } else {
    add('ok', 'No hang signature', 'Sensors kept updating and wound down normally. If a crash happened, it was after logging stopped — use a 1s polling interval and confirm logging was running at crash time.');
  }

  // 2. PCIe link stability.
  if (M.pcieRecovery) {
    const delta = M.pcieRecovery.stats.last - M.pcieRecovery.stats.first;
    if (delta > 0) {
      add('critical', 'PCIe link kept recovering',
        `The recovery/error count rose by <strong>${fmt(delta)}</strong> during the log (ended at ${fmt(M.pcieRecovery.stats.last)}). An unstable PCIe link is a top cause of random GPU drops. Try <strong>forcing Gen4</strong> in BIOS and reseating the riser/cable.`);
    } else if (M.pcieRecovery.stats.max > 0) {
      add('warn', 'Some PCIe recoveries logged',
        `The link recovered ${fmt(M.pcieRecovery.stats.max)} time(s) but the count was not climbing at the end. Worth watching, not conclusive.`);
    }
  }
  if (M.pcieLinkSpeed && M.pcieLinkSpeed.stats.min !== M.pcieLinkSpeed.stats.max) {
    add('warn', 'PCIe link speed changed',
      `Link speed varied between <strong>${fmt(M.pcieLinkSpeed.stats.min)}</strong> and <strong>${fmt(M.pcieLinkSpeed.stats.max)} GT/s</strong>. Some drop is normal at idle (ASPM); constant flapping under load is not.`);
  }

  // 3. Power delivery.
  if (M.gpu12vhpwr && Number.isFinite(M.gpu12vhpwr.stats.min) && M.gpu12vhpwr.stats.min < 11.4) {
    add('critical', '12V rail sagged',
      `The 12VHPWR/PCIe rail dropped to <strong>${M.gpu12vhpwr.stats.min.toFixed(2)} V</strong> (should stay near 12 V). Check the connector is fully seated and try a different PSU cable — under-volt on this rail is a known 40/50-series failure point.`);
  }
  if (M.gpuPower) {
    const midDrop = detectMidDrop(M.gpuPower.values, ds.sampleCount);
    if (midDrop) {
      add('warn', 'Power dropped to ~0 mid-session',
        'GPU power fell to near zero and recovered during the log, not just at the end. That can be a brief driver reset (TDR) rather than a full hang.');
    }
  }

  // 4. Thermals.
  if (M.gpuHotspot && M.gpuHotspot.stats.max >= 110) {
    add('critical', 'Hot spot very high', `Peak hot spot <strong>${fmt(M.gpuHotspot.stats.max)} °C</strong>. Over ~110 °C suggests poor die contact or dried thermal paste.`);
  }
  if (M.gpuJunction && M.gpuJunction.stats.max >= 95) {
    add('warn', 'VRAM ran hot', `Memory junction peaked at <strong>${fmt(M.gpuJunction.stats.max)} °C</strong>. GDDR throttles around 95 °C.`);
  }
  if (M.gpuTemp && M.gpuTemp.stats.max >= 84) {
    add('warn', 'Core hit throttle range', `Core temp peaked at <strong>${fmt(M.gpuTemp.stats.max)} °C</strong>, near the throttle point. Not a crash cause on its own, but worth improving airflow.`);
  } else if (M.gpuTemp) {
    add('ok', 'Temperatures look fine', `Core peaked at <strong>${fmt(M.gpuTemp.stats.max)} °C</strong> — comfortably below throttle. Heat is unlikely to be the crash cause.`);
  }

  // 5. FPS availability tip.
  if (!ds.fileHasFps) {
    add('info', 'No framerate in this log',
      'Add <strong>RTSS</strong> (Rivatuner) or PresentMon so HWiNFO logs <code>Framerate</code>. FPS dropping to 0 is the clearest "GPU stopped rendering" marker.');
  }

  const rank = { critical: 0, warn: 1, info: 2, ok: 3 };
  out.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return out;
};

function detectMidDrop(values, n) {
  // Look for a near-zero dip that recovers, away from the tail.
  let max = 0;
  for (const v of values) if (Number.isFinite(v) && v > max) max = v;
  if (max <= 0) return false;
  const lowThresh = max * 0.03;
  const cutoff = Math.floor(n * 0.9); // ignore the last 10% (that's the tail/crash)
  for (let i = 5; i < cutoff; i++) {
    if (Number.isFinite(values[i]) && values[i] <= lowThresh) {
      // recovers afterwards?
      for (let j = i + 1; j < cutoff; j++) {
        if (Number.isFinite(values[j]) && values[j] > max * 0.3) return true;
      }
    }
  }
  return false;
}

function fmt(n) {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 100) return Math.round(n).toLocaleString();
  if (Math.abs(n) >= 10) return n.toFixed(1);
  return n.toFixed(2).replace(/\.?0+$/, '');
}
LS.fmt = fmt;

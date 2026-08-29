/* ── LogScope: rendering + events ───────────────────────────── */
window.LS = window.LS || {};
LS.state = { ds: null, zoneInfo: null, crash: null, insights: null, activeKeys: [], chart: null };

const $ = (id) => document.getElementById(id);
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function toast(msg) {
  let el = $('app-toast');
  if (!el) { el = document.createElement('div'); el.id = 'app-toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('visible'), 2600);
}

function fmtDuration(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return '-';
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/* HWiNFO writes times like "20:8:34.043" — normalize to HH:MM:SS. */
function padTime(t) {
  const parts = String(t).split('.')[0].split(':');
  return parts.map((p) => p.padStart(2, '0')).join(':');
}

LS.ui = {
  init() {
    this.renderGlossary('');
    this.renderTutorials();
    this.renderValidate();
    this.renderSamples();
    this.bindEvents();
    this.setTab('upload');
    this.setDataTabsEnabled(false);
  },

  renderSamples() {
    const host = $('sampleList');
    if (!host) return;
    const samples = window.LS.SAMPLES || [];
    if (!samples.length) { host.parentElement.hidden = true; return; }
    host.innerHTML = samples.map((s) => `
      <button class="card card--interactive" type="button" data-sample="${esc(s.id)}"
        style="text-align:left;cursor:pointer;color:var(--text-primary);font-family:var(--font);margin:0">
        <div class="section__title" style="font-size:var(--text-base)">${esc(s.label)}</div>
        <p class="section__lead" style="margin-top:6px">${esc(s.blurb)}</p>
        <span class="badge badge--gpu" style="margin-top:10px;display:inline-block">Load sample →</span>
      </button>`).join('');
  },

  loadSample(id) {
    const s = (window.LS.SAMPLES || []).find((x) => x.id === id);
    if (!s) return;
    this.ingest(s.csv, s.fileName || (s.label + '.csv'));
  },

  bindEvents() {
    // Tabs
    document.querySelectorAll('.tab').forEach((t) => {
      t.addEventListener('click', () => this.setTab(t.dataset.view));
    });

    // Dropzone + file input
    const dz = $('dropzone');
    const input = $('fileInput');
    dz.addEventListener('click', () => input.click());
    dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('dragover'); }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('dragover'); }));
    dz.addEventListener('drop', (e) => {
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) this.loadFile(f);
    });
    input.addEventListener('change', () => { if (input.files[0]) this.loadFile(input.files[0]); });

    // Glossary search
    $('glossarySearch').addEventListener('input', (e) => this.renderGlossary(e.target.value));

    // Delegated: chips + accordion + sample cards + copyable commands
    document.addEventListener('click', (e) => {
      const sample = e.target.closest('[data-sample]');
      if (sample) { this.loadSample(sample.dataset.sample); return; }
      const chip = e.target.closest('.chip');
      if (chip && chip.dataset.key) { this.toggleSeries(chip.dataset.key); return; }
      const head = e.target.closest('.acc-head');
      if (head) { head.parentElement.classList.toggle('open'); return; }
      const cmd = e.target.closest('[data-cmd]');
      if (cmd) { this.copyCommand(cmd); return; }
      const reset = e.target.closest('#resetBtn');
      if (reset) this.reset();
    });
  },

  setTab(view) {
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
    document.querySelectorAll('.view').forEach((v) => { v.hidden = v.dataset.view !== view; });
    if (view === 'charts' && LS.state.chart) requestAnimationFrame(() => LS.state.chart.draw());
  },

  setDataTabsEnabled(on) {
    document.querySelectorAll('.tab[data-requires-data]').forEach((t) => {
      t.disabled = !on;
      if (on) t.removeAttribute('title');
      else t.title = 'Load a CSV to unlock';
    });
    $('resetBtn').hidden = !on;
  },

  loadFile(file) {
    const reader = new FileReader();
    reader.onerror = () => toast('Could not read that file.');
    reader.onload = () => this.ingest(String(reader.result), file.name);
    reader.readAsText(file);
  },

  /** Core: parse CSV text, analyze, and render every view. */
  ingest(text, name) {
    try {
      const parsed = LS.parseCSV(text);
      const ds = LS.buildDataset(parsed);
      if (!ds.detectedKeys.length) {
        toast('Parsed the file but found no known GPU/CPU sensors.');
      }
      const zoneInfo = LS.classifyZones(ds);
      const crash = LS.detectCrash(ds);
      const insights = LS.buildInsights(ds, zoneInfo, crash);
      LS.state = { ds, zoneInfo, crash, insights, activeKeys: [], chart: null, fileName: name };

      this.renderFileBar(name);
      this.renderOverview();
      this.renderCharts();
      this.renderBaselines();
      this.renderGlossary($('glossarySearch').value);
      this.setDataTabsEnabled(true);
      this.setTab('overview');
      toast(`Loaded ${ds.sampleCount.toLocaleString()} samples · ${ds.detectedKeys.length} sensors`);
    } catch (err) {
      toast(err.message || 'Failed to parse the CSV.');
    }
  },

  reset() {
    LS.state = { ds: null, zoneInfo: null, crash: null, insights: null, activeKeys: [], chart: null };
    $('fileInput').value = '';
    this.setDataTabsEnabled(false);
    this.renderGlossary($('glossarySearch').value);
    this.setTab('upload');
  },

  renderFileBar(name) {
    const ds = LS.state.ds;
    const crash = LS.state.crash;
    const bar = $('fileBar');
    bar.hidden = false;

    let vCls = 'ok', vTxt = 'No hang signature';
    if (crash.crashed) {
      vCls = 'critical';
      vTxt = crash.kind === 'dropout' ? 'GPU dropped off the bus' : 'GPU froze';
      if (crash.time) vTxt += ` ~${padTime(crash.time)}`;
    } else if (crash.kind === 'endedUnderLoad') {
      vCls = 'warn';
      vTxt = 'Log ended mid-load';
    }

    bar.innerHTML = `
      <span class="verdict verdict--${vCls}"><span class="verdict__dot"></span>${esc(vTxt)}</span>
      <strong>${esc(name)}</strong>
      <span class="dot">·</span> ${ds.sampleCount.toLocaleString()} samples
      <span class="dot">·</span> ${fmtDuration(ds.durationSec)}
      <span class="dot">·</span> ~${LS.fmt(ds.interval)}s interval
      <span class="dot">·</span> ${ds.detectedKeys.length} series`;
  },

  // ── Overview ──────────────────────────────────────────────
  renderOverview() {
    const { ds, insights } = LS.state;
    // Severity tally so the read takes one glance.
    const counts = { critical: 0, warn: 0, info: 0, ok: 0 };
    insights.forEach((it) => { counts[it.severity] = (counts[it.severity] || 0) + 1; });
    const labels = { critical: ['critical', 'critical'], warn: ['warning', 'warnings'], info: ['tip', 'tips'], ok: ['clear', 'clear'] };
    const sum = $('insightSummary');
    if (sum) {
      sum.innerHTML = Object.keys(counts)
        .filter((k) => counts[k])
        .map((k) => `<span class="sev sev--${k}">${counts[k]} ${labels[k][counts[k] === 1 ? 0 : 1]}</span>`)
        .join('');
    }
    // Insights
    const iconFor = { critical: '✕', warn: '!', ok: '✓', info: 'i' };
    $('insights').innerHTML = insights.map((it) => `
      <div class="insight insight--${it.severity}">
        <div class="insight__icon">${iconFor[it.severity]}</div>
        <div class="insight__body">
          <div class="insight__title">${esc(it.title)}</div>
          <div class="insight__desc">${it.desc}</div>
        </div>
      </div>`).join('');

    // Key stats
    const M = ds.metrics;
    const stats = [];
    stats.push(stat('Duration', fmtDuration(ds.durationSec), ''));
    stats.push(stat('Samples', ds.sampleCount.toLocaleString(), ''));
    const pushMetric = (key, mode, label, thr) => {
      const m = M[key]; if (!m) return;
      const v = mode === 'min' ? m.stats.min : mode === 'avg' ? m.stats.avg : mode === 'delta' ? (m.stats.last - m.stats.first) : m.stats.max;
      stats.push(stat(label || `${mode} ${m.def.label}`, `${LS.fmt(v)}<span class="unit">${m.def.unit}</span>`, thr ? thr(v) : ''));
    };
    pushMetric('gpuTemp', 'max', 'Peak GPU temp', (v) => v >= 90 ? 'bad' : v >= 84 ? 'warn' : 'ok');
    pushMetric('gpuJunction', 'max', 'Peak VRAM temp', (v) => v >= 95 ? 'warn' : 'ok');
    pushMetric('gpuHotspot', 'max', 'Peak hot spot', (v) => v >= 110 ? 'bad' : 'ok');
    pushMetric('gpuPower', 'max', 'Peak GPU power', '');
    pushMetric('sysPower', 'max', 'Peak system draw', '');
    pushMetric('gpu12vhpwr', 'min', 'Min 12V rail', (v) => v < 11.4 ? 'bad' : 'ok');
    pushMetric('mobo12v', 'min', 'Min board +12V', (v) => v < 11.4 ? 'bad' : v > 12.6 ? 'warn' : 'ok');
    pushMetric('gpuVcore', 'max', 'Peak core voltage', '');
    pushMetric('gpuClock', 'max', 'Peak core clock', '');
    pushMetric('gpuLoad', 'avg', 'Avg GPU load', '');
    pushMetric('fps', 'avg', 'Avg framerate', '');
    if (M.pcieRecovery) {
      const d = M.pcieRecovery.stats.last - M.pcieRecovery.stats.first;
      stats.push(stat('PCIe recoveries', LS.fmt(M.pcieRecovery.stats.last), d > 0 ? 'bad' : M.pcieRecovery.stats.max > 0 ? 'warn' : 'ok'));
    }
    $('statGrid').innerHTML = stats.join('');

    function stat(label, value, cls) {
      return `<div class="stat ${cls ? 'stat--' + cls : ''}">
        <div class="stat__label">${esc(label)}</div>
        <div class="stat__value">${value}</div></div>`;
    }
  },

  // ── Charts ────────────────────────────────────────────────
  renderCharts() {
    const ds = LS.state.ds;
    const preferred = ['gpuTemp', 'gpuPower', 'gpuLoad', 'gpuClock', 'fps', 'pcieRecovery', 'gpu12vhpwr', 'gpuJunction'];
    const active = preferred.filter((k) => ds.metrics[k]).slice(0, 4);
    LS.state.activeKeys = active;

    // Chips for every detected metric. `data-tip` shows a short plain-language
    // definition on hover/focus (e.g. "what's the GPU Hot Spot Temperature?").
    $('chips').innerHTML = ds.detectedKeys.map((k) => {
      const m = ds.metrics[k];
      const on = active.includes(k);
      const tip = `${m.def.plain} (${m.def.unit || 'count'})`;
      return `<button class="chip ${on ? 'active' : ''}" data-key="${k}"
        data-tip="${esc(tip)}" aria-label="${esc(m.def.label)}. ${esc(m.def.plain)}">
        <span class="chip__dot" style="background:${m.def.color}"></span>${esc(m.def.label)}</button>`;
    }).join('');

    if (!LS.state.chart) {
      LS.state.chart = new LS.Chart($('chartCanvas'), $('chartTooltip'));
    }
    LS.state.chart.setData(ds, LS.state.zoneInfo, LS.state.crash);
    LS.state.chart.setSeries(active);
  },

  toggleSeries(key) {
    const keys = LS.state.activeKeys;
    const i = keys.indexOf(key);
    if (i >= 0) keys.splice(i, 1); else keys.push(key);
    document.querySelectorAll(`.chip[data-key="${key}"]`).forEach((c) => c.classList.toggle('active'));
    if (LS.state.chart) LS.state.chart.setSeries(keys);
  },

  // ── Baselines ─────────────────────────────────────────────
  renderBaselines() {
    const { ds, zoneInfo } = LS.state;
    const counts = zoneInfo.counts;
    const total = ds.sampleCount || 1;
    $('zoneSummary').innerHTML = LS.LOAD_ZONES.map((z) => {
      const c = counts[z.key] || 0;
      const pct = ((c / total) * 100).toFixed(0);
      return `<div class="stat">
        <div class="stat__label"><span class="zone-pill ${z.cls}">${z.label}</span></div>
        <div class="stat__value">${pct}<span class="unit">%</span></div>
        <div class="zone-bar"><span class="zone-bar__fill ${z.cls}" style="width:${Math.max(2, +pct)}%"></span></div>
        <div class="stat__sub">${c.toLocaleString()} samples · load ${z.min}–${z.max === 101 ? 100 : z.max}%</div>
      </div>`;
    }).join('');

    const basisName = zoneInfo.basis === 'gpuLoad' ? 'GPU utilization' : zoneInfo.basis === 'gpuPower' ? 'GPU power (no load sensor found)' : 'unavailable';
    $('baselineBasis').textContent = `Load zones computed from ${basisName}.`;

    const rows = ds.detectedKeys
      .filter((k) => ['gpu', 'power', 'pcie', 'fps'].includes(ds.metrics[k].def.kind))
      .map((k) => {
        const per = LS.perZoneStats(ds, zoneInfo, k);
        const m = ds.metrics[k];
        const cell = (z) => per[z].count ? `${LS.fmt(per[z].avg)} <span class="muted">/ ${LS.fmt(per[z].max)}</span>` : '<span class="muted">-</span>';
        return `<tr>
          <td class="metric-name">${esc(m.def.label)} <span class="muted nowrap">${m.def.unit}</span></td>
          <td>${cell('idle')}</td><td>${cell('low')}</td><td>${cell('medium')}</td><td>${cell('high')}</td>
        </tr>`;
      }).join('');
    $('baselineTable').innerHTML = rows || '<tr><td colspan="5" class="empty">No comparable sensors found.</td></tr>';
  },

  // ── Translate / glossary ──────────────────────────────────
  renderGlossary(filter) {
    const q = (filter || '').trim().toLowerCase();
    const detected = LS.state.ds ? new Set(LS.state.ds.detectedKeys) : new Set();
    const rows = LS.SENSOR_DEFS.filter((d) => {
      if (!q) return true;
      return (d.label + ' ' + d.plain + ' ' + d.concern).toLowerCase().includes(q);
    }).map((d) => {
      const found = detected.has(d.key);
      const m = found ? LS.state.ds.metrics[d.key] : null;
      const val = m ? `<div class="stat__sub">In this log: ${LS.fmt(m.stats.min)}–${LS.fmt(m.stats.max)} ${d.unit} (avg ${LS.fmt(m.stats.avg)})</div>` : '';
      return `<tr>
        <td class="metric-name">
          <span class="chip__dot" style="display:inline-block;background:${d.color}"></span>
          ${esc(d.label)} <span class="muted nowrap">${d.unit}</span>
          ${found ? '<span class="badge badge--gpu" style="margin-left:6px">detected</span>' : ''}
          ${val}
        </td>
        <td class="wrap">${esc(d.plain)}</td>
        <td class="wrap"><span class="muted">Normal:</span> ${esc(d.normal)}<br><span class="muted">Watch for:</span> ${esc(d.concern)}</td>
      </tr>`;
    }).join('');
    $('glossaryTable').innerHTML = rows || '<tr><td colspan="3" class="empty">No metrics match that search.</td></tr>';
  },

  // ── Tutorials ─────────────────────────────────────────────
  renderTutorials() {
    $('tutorials').innerHTML = LS.TUTORIALS.map((t, i) => `
      <div class="acc-item ${i === 0 ? 'open' : ''}">
        <button class="acc-head" type="button" aria-expanded="${i === 0}">
          <svg class="acc-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>
          ${esc(t.tool)}
          <span class="acc-tag">${esc(t.tag)}</span>
        </button>
        <div class="acc-body"><div class="acc-body-inner">
          <p>${esc(t.what)}</p>
          <h4>Steps</h4>
          <ul>${t.steps.map((s) => `<li>${s}</li>`).join('')}</ul>
          <div class="look-for"><strong>What to look for:</strong> ${t.lookFor}</div>
        </div></div>
      </div>`).join('');
  },

  // ── Validate (toolkit guide) ──────────────────────────────
  renderValidate() {
    const root = $('validateRoot');
    if (!root || !LS.VALIDATE) return;
    const costCls = { free: 'free', paid: 'paid', 'built-in': 'builtin' };
    const costTxt = { free: 'Free', paid: 'Paid', 'built-in': 'Built-in' };
    const toolCard = (t) => `
      <div class="tool-card">
        <div class="tool-card__head">
          <strong class="tool-card__name">${esc(t.name)}</strong>
          <span class="tool-cost tool-cost--${costCls[t.cost] || 'free'}">${costTxt[t.cost] || esc(t.cost)}</span>
        </div>
        <p class="tool-card__what">${t.what}</p>
        ${t.steps ? `<ul class="tool-card__steps">${t.steps.map((s) => `<li>${s}</li>`).join('')}</ul>` : ''}
        ${t.commands ? `<div class="cmd-list">${t.commands.map((c) => `
          <button class="cmd-chip" type="button" data-cmd="${esc(c.cmd)}" title="Copy command">
            <code>${esc(c.cmd)}</code>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            <span class="cmd-chip__note">${esc(c.note)}</span>
          </button>`).join('')}</div>` : ''}
        <div class="tool-card__proves"><strong>Proves:</strong> ${t.proves}</div>
        <div class="tool-card__foot">
          ${t.url ? `<a class="btn btn--ghost btn--sm" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">Official site ↗</a>` : ''}
          ${t.tutorial ? '<span class="tool-card__ref">Full steps in the Tutorials tab</span>' : ''}
        </div>
      </div>`;
    root.innerHTML = LS.VALIDATE.phases.map((p, pi) => `
      <section class="phase">
        <div class="phase__head">
          <span class="phase__num">${pi + 1}</span>
          <div class="phase__titles">
            <h3 class="phase__title">${esc(p.title)}</h3>
            <p class="phase__intro">${esc(p.intro)}</p>
          </div>
        </div>
        <div class="tool-grid">${p.tools.map(toolCard).join('')}</div>
      </section>`).join('');

    const xidHost = $('xidTable');
    if (xidHost) {
      const pointsChip = {
        software: '<span class="xid-points xid-points--software">software</span>',
        hardware: '<span class="xid-points xid-points--hardware">hardware</span>',
        power: '<span class="xid-points xid-points--power">power / link</span>',
      };
      xidHost.innerHTML = LS.VALIDATE.xid.map((x) => `
        <tr>
          <td class="metric-name nowrap">Xid ${esc(x.code)}</td>
          <td class="wrap">${esc(x.meaning)}</td>
          <td>${pointsChip[x.points] || ''}</td>
          <td class="wrap muted">${esc(x.note)}</td>
        </tr>`).join('');
    }
  },

  copyCommand(el) {
    const text = el.dataset.cmd;
    const done = () => { el.classList.add('copied'); setTimeout(() => el.classList.remove('copied'), 1200); toast('Command copied'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => this._copyFallback(text, done));
    } else {
      this._copyFallback(text, done);
    }
  },

  _copyFallback(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed: select it manually'); }
    document.body.removeChild(ta);
  },
};

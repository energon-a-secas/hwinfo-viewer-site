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
  if (!Number.isFinite(sec) || sec <= 0) return '—';
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

LS.ui = {
  init() {
    this.renderGlossary('');
    this.renderTutorials();
    this.bindEvents();
    this.setTab('upload');
    this.setDataTabsEnabled(false);
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

    // Delegated: chips + accordion
    document.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (chip && chip.dataset.key) { this.toggleSeries(chip.dataset.key); return; }
      const head = e.target.closest('.acc-head');
      if (head) { head.parentElement.classList.toggle('open'); return; }
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
      t.hidden = !on;
    });
    $('resetBtn').hidden = !on;
  },

  loadFile(file) {
    const reader = new FileReader();
    reader.onerror = () => toast('Could not read that file.');
    reader.onload = () => {
      try {
        const parsed = LS.parseCSV(String(reader.result));
        const ds = LS.buildDataset(parsed);
        if (!ds.detectedKeys.length) {
          toast('Parsed the file but found no known GPU/CPU sensors.');
        }
        const zoneInfo = LS.classifyZones(ds);
        const crash = LS.detectCrash(ds);
        const insights = LS.buildInsights(ds, zoneInfo, crash);
        LS.state = { ds, zoneInfo, crash, insights, activeKeys: [], chart: null, fileName: file.name };

        this.renderFileBar(file.name);
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
    };
    reader.readAsText(file);
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
    const bar = $('fileBar');
    bar.hidden = false;
    bar.innerHTML = `
      <span class="badge badge--gpu">CSV</span>
      <strong>${esc(name)}</strong>
      <span class="dot">·</span> ${ds.sampleCount.toLocaleString()} samples
      <span class="dot">·</span> ${fmtDuration(ds.durationSec)}
      <span class="dot">·</span> ~${LS.fmt(ds.interval)}s interval
      <span class="dot">·</span> ${ds.detectedKeys.length} sensors detected`;
  },

  // ── Overview ──────────────────────────────────────────────
  renderOverview() {
    const { ds, insights } = LS.state;
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
    pushMetric('gpu12vhpwr', 'min', 'Min 12V rail', (v) => v < 11.4 ? 'bad' : 'ok');
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

    // Chips for every detected metric.
    $('chips').innerHTML = ds.detectedKeys.map((k) => {
      const m = ds.metrics[k];
      const on = active.includes(k);
      return `<button class="chip ${on ? 'active' : ''}" data-key="${k}">
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
        const cell = (z) => per[z].count ? `${LS.fmt(per[z].avg)} <span class="muted">/ ${LS.fmt(per[z].max)}</span>` : '<span class="muted">—</span>';
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
};

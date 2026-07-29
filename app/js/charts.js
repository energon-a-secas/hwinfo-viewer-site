/* ── LogScope: dependency-free canvas time-series chart ─────── */
window.LS = window.LS || {};

const PAD = { top: 14, right: 14, bottom: 26, left: 44 };

LS.Chart = class Chart {
  constructor(canvas, tooltipEl) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.tooltip = tooltipEl;
    this.ds = null;
    this.zoneInfo = null;
    this.crash = null;
    this.keys = [];
    this.hoverIndex = -1;
    this._plot = null;
    this._onMove = this._onMove.bind(this);
    this._onLeave = this._onLeave.bind(this);
    this._onResize = () => this.draw();
    canvas.addEventListener('pointermove', this._onMove);
    canvas.addEventListener('pointerleave', this._onLeave);
    window.addEventListener('resize', this._onResize);
  }

  setData(ds, zoneInfo, crash) {
    this.ds = ds; this.zoneInfo = zoneInfo; this.crash = crash;
    this.hoverIndex = -1;
  }
  setSeries(keys) { this.keys = keys.slice(); this.draw(); }

  _sizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(320, rect.width);
    const h = rect.height || 340;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  _seriesRange(key) {
    const m = this.ds.metrics[key];
    let lo = m.stats.min, hi = m.stats.max;
    if (lo === hi) { lo -= 1; hi += 1; }
    return { lo, hi };
  }

  draw() {
    if (!this.ds) return;
    const ctx = this.ctx;
    const { w, h } = this._sizeCanvas();
    ctx.clearRect(0, 0, w, h);
    const n = this.ds.sampleCount;
    const x0 = PAD.left, x1 = w - PAD.right;
    const y0 = PAD.top, y1 = h - PAD.bottom;
    const plotW = x1 - x0, plotH = y1 - y0;
    const xAt = (i) => x0 + (n <= 1 ? 0 : (i / (n - 1)) * plotW);

    // Zone background shading.
    if (this.zoneInfo && this.zoneInfo.basis !== 'none') {
      const zmap = {};
      LS.LOAD_ZONES.forEach((z) => { zmap[z.key] = z.rgba; });
      let start = 0;
      for (let i = 1; i <= n; i++) {
        const cur = this.zoneInfo.zones[i];
        const prev = this.zoneInfo.zones[i - 1];
        if (i === n || cur !== prev) {
          if (prev && zmap[prev]) {
            ctx.fillStyle = zmap[prev];
            ctx.fillRect(xAt(start), y0, xAt(i - 1) - xAt(start) + 1, plotH);
          }
          start = i;
        }
      }
    }

    // Grid + axis frame.
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let g = 0; g <= 4; g++) {
      const y = y0 + (g / 4) * plotH;
      ctx.moveTo(x0, y + 0.5); ctx.lineTo(x1, y + 0.5);
    }
    ctx.stroke();

    // Y labels: 0–100% normalized reference.
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '10px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let g = 0; g <= 4; g++) {
      const y = y0 + (g / 4) * plotH;
      ctx.fillText(`${100 - g * 25}%`, x0 - 6, y);
    }

    // X time labels.
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const ticks = 5;
    for (let t = 0; t <= ticks; t++) {
      const i = Math.round((t / ticks) * (n - 1));
      const label = (this.ds.times[i] || '').split('.')[0];
      ctx.fillText(label, Math.min(Math.max(xAt(i), x0 + 16), x1 - 16), y1 + 6);
    }

    // Series (each normalized to its own min/max).
    for (const key of this.keys) {
      const m = this.ds.metrics[key];
      if (!m) continue;
      const { lo, hi } = this._seriesRange(key);
      const span = hi - lo || 1;
      ctx.strokeStyle = m.def.color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < n; i++) {
        const v = m.values[i];
        if (!Number.isFinite(v)) { started = false; continue; }
        const yy = y1 - ((v - lo) / span) * plotH;
        const xx = xAt(i);
        if (!started) { ctx.moveTo(xx, yy); started = true; }
        else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }

    // Crash marker.
    if (this.crash && this.crash.crashed && this.crash.index >= 0) {
      const cx = xAt(this.crash.index);
      ctx.strokeStyle = 'rgba(251,113,133,0.9)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(cx, y0); ctx.lineTo(cx, y1); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(251,113,133,0.95)';
      ctx.textAlign = cx > w * 0.7 ? 'right' : 'left';
      ctx.textBaseline = 'top';
      ctx.font = '10px ui-monospace, Menlo, monospace';
      ctx.fillText('⚑ hang', cx + (cx > w * 0.7 ? -6 : 6), y0 + 2);
    }

    // Hover guide.
    if (this.hoverIndex >= 0 && this.hoverIndex < n) {
      const hx = xAt(this.hoverIndex);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(hx, y0); ctx.lineTo(hx, y1); ctx.stroke();
      for (const key of this.keys) {
        const m = this.ds.metrics[key];
        const v = m.values[this.hoverIndex];
        if (!Number.isFinite(v)) continue;
        const { lo, hi } = this._seriesRange(key);
        const span = hi - lo || 1;
        const yy = y1 - ((v - lo) / span) * plotH;
        ctx.fillStyle = m.def.color;
        ctx.beginPath(); ctx.arc(hx, yy, 3, 0, Math.PI * 2); ctx.fill();
      }
    }

    this._plot = { x0, x1, y0, y1, plotW, xAt, n };
  }

  _onMove(e) {
    if (!this._plot || !this.ds) return;
    const rect = this.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const { x0, plotW, n } = this._plot;
    let i = Math.round(((px - x0) / plotW) * (n - 1));
    i = Math.max(0, Math.min(n - 1, i));
    if (i !== this.hoverIndex) { this.hoverIndex = i; this.draw(); }
    this._showTooltip(i, e.clientX - rect.left, e.clientY - rect.top);
  }
  _onLeave() {
    this.hoverIndex = -1;
    this.draw();
    if (this.tooltip) this.tooltip.classList.remove('visible');
  }

  _showTooltip(i, px, py) {
    if (!this.tooltip) return;
    const time = (this.ds.times[i] || '').split('.')[0];
    let html = `<div class="tt-time">${time}</div>`;
    for (const key of this.keys) {
      const m = this.ds.metrics[key];
      const v = m.values[i];
      const val = Number.isFinite(v) ? `${LS.fmt(v)} ${m.def.unit}` : '—';
      html += `<div class="tt-row"><span class="tt-dot" style="background:${m.def.color}"></span>${m.def.label}: <strong>${val}</strong></div>`;
    }
    this.tooltip.innerHTML = html;
    this.tooltip.classList.add('visible');
    const rect = this.canvas.getBoundingClientRect();
    const tw = this.tooltip.offsetWidth;
    let left = px + 14;
    if (left + tw > rect.width) left = px - tw - 14;
    this.tooltip.style.left = Math.max(0, left) + 'px';
    this.tooltip.style.top = Math.max(0, py - 10) + 'px';
  }
};

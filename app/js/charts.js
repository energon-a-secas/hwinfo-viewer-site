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
    this._dsId = 0;
    this._zoneRuns = null;
    this._cache = null; // { sig, paths }
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
    this._dsId++;
    this._cache = null;
    this._zoneRuns = this._buildZoneRuns();
  }
  setSeries(keys) { this.keys = keys.slice(); this._cache = null; this.draw(); }

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

  /** Precompute contiguous load-zone segments as index ranges. */
  _buildZoneRuns() {
    if (!this.zoneInfo || this.zoneInfo.basis === 'none') return [];
    const z = this.zoneInfo.zones;
    const n = this.ds.sampleCount;
    const runs = [];
    let start = 0;
    for (let i = 1; i <= n; i++) {
      if (i === n || z[i] !== z[i - 1]) {
        if (z[start]) runs.push({ from: start, to: i - 1, key: z[start] });
        start = i;
      }
    }
    return runs;
  }

  /**
   * Build screen-space polylines per series, decimated with min/max per
   * pixel column so large logs (tens of thousands of samples) stay legible
   * while spikes are preserved. Returns [{color, subpaths:[[{x,y}...]]}].
   */
  _buildPaths(geo) {
    const { x0, plotW, y1, plotH, n } = geo;
    const xAt = (i) => x0 + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
    const maxCols = Math.max(1, Math.floor(plotW)); // ~1 bucket per pixel
    const out = [];
    for (const key of this.keys) {
      const m = this.ds.metrics[key];
      if (!m) continue;
      const { lo, hi } = this._seriesRange(key);
      const span = hi - lo || 1;
      const yAt = (v) => y1 - ((v - lo) / span) * plotH;
      const subpaths = [];
      let cur = null;
      const push = (i, v) => {
        if (!cur) { cur = []; subpaths.push(cur); }
        cur.push({ x: xAt(i), y: yAt(v) });
      };
      const gap = () => { cur = null; };

      if (n <= maxCols) {
        for (let i = 0; i < n; i++) {
          const v = m.values[i];
          if (!Number.isFinite(v)) { gap(); continue; }
          push(i, v);
        }
      } else {
        const bucket = n / maxCols;
        for (let b = 0; b < maxCols; b++) {
          const s0 = Math.floor(b * bucket);
          const s1 = Math.min(n, Math.floor((b + 1) * bucket));
          let minV = Infinity, maxV = -Infinity, minI = -1, maxI = -1, any = false;
          for (let i = s0; i < s1; i++) {
            const v = m.values[i];
            if (!Number.isFinite(v)) continue;
            any = true;
            if (v < minV) { minV = v; minI = i; }
            if (v > maxV) { maxV = v; maxI = i; }
          }
          if (!any) { gap(); continue; }
          // Emit min & max in sample order so the envelope reads left→right.
          if (minI <= maxI) { push(minI, minV); if (maxI !== minI) push(maxI, maxV); }
          else { push(maxI, maxV); push(minI, minV); }
        }
      }
      out.push({ color: m.def.color, subpaths });
    }
    return out;
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
    const geo = { x0, x1, y0, y1, plotW, plotH, n };

    // Zone background shading (from precomputed runs).
    if (this._zoneRuns && this._zoneRuns.length) {
      const zmap = {};
      LS.LOAD_ZONES.forEach((z) => { zmap[z.key] = z.rgba; });
      for (const r of this._zoneRuns) {
        const fill = zmap[r.key];
        if (!fill) continue;
        ctx.fillStyle = fill;
        const xa = xAt(r.from), xb = xAt(r.to);
        ctx.fillRect(xa, y0, Math.max(1, xb - xa + 1), plotH);
      }
    }

    // Grid.
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let g = 0; g <= 4; g++) {
      const y = y0 + (g / 4) * plotH;
      ctx.moveTo(x0, y + 0.5); ctx.lineTo(x1, y + 0.5);
    }
    ctx.stroke();

    // Y labels (normalized reference).
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

    // Series (cached, decimated screen-space polylines).
    const sig = `${Math.round(plotW)}x${Math.round(plotH)}|${this.keys.join(',')}|${this._dsId}`;
    if (!this._cache || this._cache.sig !== sig) {
      this._cache = { sig, paths: this._buildPaths(geo) };
    }
    ctx.lineWidth = 1.4;
    ctx.lineJoin = 'round';
    for (const p of this._cache.paths) {
      ctx.strokeStyle = p.color;
      for (const sub of p.subpaths) {
        if (!sub.length) continue;
        ctx.beginPath();
        ctx.moveTo(sub[0].x, sub[0].y);
        for (let i = 1; i < sub.length; i++) ctx.lineTo(sub[i].x, sub[i].y);
        ctx.stroke();
      }
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

    // Hover guide + dots (full-resolution value at the hovered sample).
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
      const val = Number.isFinite(v) ? `${LS.fmt(v)} ${m.def.unit}` : '-';
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

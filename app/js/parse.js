/* ── LogScope: CSV parsing + HWiNFO metric detection ────────── */
window.LS = window.LS || {};

/** Minimal, quote-aware CSV row splitter for one line. */
function splitCsvLine(line) {
  const out = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      out.push(field);
      field = '';
    } else {
      field += c;
    }
  }
  out.push(field);
  return out;
}

/** Parse full CSV text into { headers, rows }. */
LS.parseCSV = function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.length > 0);
  if (lines.length < 2) throw new Error('This file has no data rows.');
  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const first = (cells[0] || '').trim();
    // Skip repeated header rows and non-data trailer lines.
    if (!first || first.toLowerCase() === 'date') continue;
    if (!/[.\/-]/.test(first)) continue; // first col should look like a date
    rows.push(cells);
  }
  if (!rows.length) throw new Error('Could not find any data rows. Is this a HWiNFO CSV log?');
  return { headers, rows };
};

function toNum(v) {
  if (v == null) return NaN;
  const s = String(v).trim();
  if (!s || s === '-' || /^(yes|no|n\/a|na)$/i.test(s)) {
    if (/^yes$/i.test(s)) return 1;
    if (/^no$/i.test(s)) return 0;
    return NaN;
  }
  const n = parseFloat(s.replace(/[^0-9eE.+-]/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

function headerMatches(headerLc, def) {
  if (def.exclude && def.exclude.some((ex) => headerLc.includes(ex))) return false;
  return def.match.some((group) => group.every((tok) => headerLc.includes(tok)));
}

function computeStats(values) {
  let min = Infinity, max = -Infinity, sum = 0, n = 0, last = NaN, first = NaN;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    if (Number.isNaN(first)) first = v;
    last = v;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v; n++;
  }
  if (!n) return { min: NaN, max: NaN, avg: NaN, last: NaN, first: NaN, count: 0 };
  return { min, max, avg: sum / n, last, first, count: n };
}

/** Parse a HWiNFO time string like "10:31:22.125" or "20:58:2.591". */
function timeToSeconds(t) {
  const m = /(\d{1,2}):(\d{1,2}):(\d{1,2})(?:\.(\d{1,3}))?/.exec(t || '');
  if (!m) return NaN;
  return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (m[4] ? +('0.' + m[4]) : 0);
}

/**
 * Build the analysis dataset from parsed CSV.
 * Detects the time columns and every known sensor.
 */
LS.buildDataset = function buildDataset(parsed) {
  const { headers, rows } = parsed;
  const headersLc = headers.map((h) => h.toLowerCase());

  // Time = first column that is a real clock (usually index 1).
  let timeCol = -1;
  for (let c = 0; c < Math.min(headers.length, 4); c++) {
    if (rows.length && !Number.isNaN(timeToSeconds(rows[0][c]))) { timeCol = c; break; }
  }

  const times = [];
  const timeSec = [];
  for (const r of rows) {
    const raw = timeCol >= 0 ? (r[timeCol] || '') : '';
    times.push(raw.trim());
    timeSec.push(timeToSeconds(raw));
  }

  // Duration / interval (handle wrap past midnight).
  let durationSec = 0, interval = 0;
  const validT = timeSec.filter((s) => Number.isFinite(s));
  if (validT.length >= 2) {
    let span = validT[validT.length - 1] - validT[0];
    if (span < 0) span += 86400;
    durationSec = span;
    interval = span / (validT.length - 1);
  }

  // Column value cache so we only parse each column once.
  const colCache = {};
  function columnValues(c) {
    if (colCache[c]) return colCache[c];
    const vals = new Array(rows.length);
    for (let i = 0; i < rows.length; i++) vals[i] = toNum(rows[i][c]);
    return (colCache[c] = vals);
  }

  // Detect sensors. When several headers match one def (HWiNFO exposes
  // near-duplicate sensors, some of them empty), pick the column that
  // actually carries data — widest numeric range wins.
  const claimed = new Set();
  const metrics = {};
  for (const def of LS.SENSOR_DEFS) {
    let best = null;
    for (let c = 0; c < headers.length; c++) {
      if (claimed.has(c) || c === timeCol) continue;
      if (!headerMatches(headersLc[c], def)) continue;
      const values = columnValues(c);
      const stats = computeStats(values);
      if (!stats.count) continue;
      const range = (stats.max - stats.min) || 0;
      const score = range * 1e6 + Math.abs(stats.max) + stats.count * 1e-6;
      if (!best || score > best.score) best = { colIndex: c, values, stats, score };
    }
    if (!best) continue;
    claimed.add(best.colIndex);
    metrics[def.key] = {
      def, colIndex: best.colIndex, rawHeader: headers[best.colIndex],
      values: best.values, stats: best.stats,
    };
  }

  return {
    headers, rows, times, timeSec,
    sampleCount: rows.length,
    durationSec, interval,
    metrics,
    detectedKeys: Object.keys(metrics),
    fileHasFps: !!metrics.fps,
  };
};

/** Assign each sample to a load zone using GPU utilization (fallback: power). */
LS.classifyZones = function classifyZones(ds) {
  const load = ds.metrics.gpuLoad ? ds.metrics.gpuLoad.values : null;
  const power = ds.metrics.gpuPower ? ds.metrics.gpuPower : null;
  const zones = new Array(ds.sampleCount).fill(null);
  let pctFn;
  if (load) {
    pctFn = (i) => load[i];
  } else if (power) {
    const max = power.stats.max || 1;
    pctFn = (i) => (power.values[i] / max) * 100;
  } else {
    return { zones, basis: 'none', counts: {} };
  }
  const counts = { idle: 0, low: 0, medium: 0, high: 0 };
  for (let i = 0; i < ds.sampleCount; i++) {
    const p = pctFn(i);
    if (!Number.isFinite(p)) continue;
    const z = LS.LOAD_ZONES.find((zn) => p >= zn.min && p < zn.max) || LS.LOAD_ZONES[0];
    zones[i] = z.key;
    counts[z.key]++;
  }
  return { zones, basis: load ? 'gpuLoad' : 'gpuPower', counts };
};

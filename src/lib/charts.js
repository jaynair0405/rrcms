/**
 * Server-rendered SVG charts.
 *
 * No client-side library, no build step, no canvas — the chart arrives as part
 * of the HTML, which means it prints, it works with JavaScript off, and it does
 * not depend on a CDN this network may not reach.
 *
 * House rules, applied by every function here:
 *   - bars are at most 24px thick with a 4px rounded data-end and a square foot
 *   - lines are 2px, end-markers are r=4.5 with a 2px ring in the surface colour
 *   - gridlines and axes are solid 1px hairlines in --grid, never dashed
 *   - values are labelled sparingly — the end, the extreme, the one that matters
 *   - text never wears the series colour; identity comes from the mark beside it
 *   - two or more series always get a legend
 *   - every chart on a page also has a table on the same page, so no value is
 *     reachable only by looking at a picture
 *
 * Colours are CSS custom properties from app.css, so a chart follows the theme
 * rather than hardcoding hex.
 */

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// System sans is roughly 0.55em average advance; enough to reserve gutters with.
const textW = (s, size) => String(s == null ? '' : s).length * size * 0.55;

const SLOT = n => `var(--s${n})`;
const TONE = { good: 'var(--good)', warning: 'var(--warning)', critical: 'var(--critical)',
               neutral: 'var(--text-muted)' };
const colourOf = r => r.tone ? (TONE[r.tone] || r.tone) : (r.slot ? SLOT(r.slot) : SLOT(1));

/** Nice round ceiling for an axis, so ticks land on readable numbers. */
function niceMax(v) {
  if (!v || v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  return (steps.find(x => n <= x) || 10) * mag;
}

const fmtInt = n => Number(n || 0).toLocaleString('en-IN');

/** Rounded-at-the-data-end bar. Square where it meets the baseline. */
function barPathH(x0, y, w, h, r = 4) {
  const rr = Math.max(0, Math.min(r, w));
  if (w <= 0.5) return '';
  const x1 = x0 + w;
  return `M${x0},${y} H${x1 - rr} A${rr},${rr} 0 0 1 ${x1},${y + rr} V${y + h - rr} `
       + `A${rr},${rr} 0 0 1 ${x1 - rr},${y + h} H${x0} Z`;
}
function barPathV(x, yTop, w, h, r = 4) {
  const rr = Math.max(0, Math.min(r, h, w / 2));
  if (h <= 0.5) return '';
  const yBot = yTop + h;
  return `M${x},${yBot} V${yTop + rr} A${rr},${rr} 0 0 1 ${x + rr},${yTop} `
       + `H${x + w - rr} A${rr},${rr} 0 0 1 ${x + w},${yTop + rr} V${yBot} Z`;
}

function frame(w, h, title, body) {
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" `
       + `preserveAspectRatio="xMinYMin meet" role="img" aria-label="${esc(title)}">`
       + `<title>${esc(title)}</title>${body}</svg>`;
}

/**
 * Horizontal bars — the default for comparing magnitude across named things,
 * because long names read straight instead of being turned on their side.
 *
 * rows: [{ label, value, note?, tone?, slot? }]
 * opts: { width, title, valueFmt, threshold: { value, label }, max }
 */
function hbar(rows, opts = {}) {
  const width = opts.width || 640;
  const fmt = opts.valueFmt || fmtInt;
  const title = opts.title || 'Chart';
  if (!rows.length) return frame(width, 40, title, '');

  const labelW = Math.min(190, Math.max(60, ...rows.map(r => textW(r.label, 11.5) + 10)));
  const valueW = Math.max(34, ...rows.map(r => textW(fmt(r.value), 11.5) + 10));
  const padL = Math.ceil(labelW), padR = Math.ceil(valueW) + 6, padT = opts.threshold ? 20 : 8, padB = 6;

  const band = 26;
  const h = padT + rows.length * band + padB;
  const plotW = Math.max(40, width - padL - padR);
  const max = opts.max || niceMax(Math.max(...rows.map(r => +r.value || 0),
    opts.threshold ? opts.threshold.value : 0));
  const x = v => padL + (Math.max(0, +v || 0) / max) * plotW;
  const thick = Math.min(24, band - 8);

  let s = '';
  // Baseline first, so bars sit on top of it.
  s += `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + rows.length * band}" `
     + `stroke="var(--grid)" stroke-width="1"/>`;

  rows.forEach((r, i) => {
    const y = padT + i * band + (band - thick) / 2;
    const w = x(r.value) - padL;
    s += `<text x="${padL - 8}" y="${y + thick / 2 + 4}" text-anchor="end" font-size="11.5" `
       + `fill="var(--text-secondary)">${esc(r.label)}</text>`;
    s += `<path d="${barPathH(padL, y, w, thick)}" fill="${colourOf(r)}"/>`;
    s += `<text x="${padL + w + 7}" y="${y + thick / 2 + 4}" font-size="11.5" `
       + `fill="var(--text-secondary)" font-variant-numeric="tabular-nums">${esc(fmt(r.value))}`
       + (r.note ? ` <tspan fill="var(--text-muted)">${esc(r.note)}</tspan>` : '') + `</text>`;
  });

  if (opts.threshold) {
    const tx = x(opts.threshold.value);
    s += `<line x1="${tx}" y1="${padT - 4}" x2="${tx}" y2="${padT + rows.length * band}" `
       + `stroke="var(--text-muted)" stroke-width="1"/>`;
    s += `<text x="${tx}" y="${padT - 8}" text-anchor="middle" font-size="10.5" `
       + `fill="var(--text-muted)">${esc(opts.threshold.label)}</text>`;
  }
  return frame(width, h, title, s);
}

/**
 * A single line over time. One series, so no legend — the card title says what
 * it is. The last point is labelled; the rest are carried by the axis.
 *
 * points: [{ x: 'Mar 2026', y: 4.32 }]  (y may be null for a gap)
 * opts: { width, height, title, yMin, yMax, valueFmt, reference: {value, label} }
 */
function line(points, opts = {}) {
  const width = opts.width || 640;
  const height = opts.height || 190;
  const fmt = opts.valueFmt || (v => Number(v).toFixed(2));
  const title = opts.title || 'Trend';
  const real = points.filter(p => p.y !== null && p.y !== undefined && !Number.isNaN(+p.y));
  if (real.length < 2) return frame(width, 40, title,
    `<text x="0" y="20" font-size="12" fill="var(--text-muted)">Not enough months yet.</text>`);

  // The reference line is always inside the range, otherwise the rule that the
  // whole chart is judged against would sit off-screen.
  const vals = real.map(p => +p.y).concat(opts.reference ? [opts.reference.value] : []);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi === lo) { hi = lo + 1; }
  const padY = (hi - lo) * 0.18;
  lo = opts.yMin !== undefined ? Math.min(opts.yMin, lo) : lo - padY;
  hi = opts.yMax !== undefined ? Math.max(opts.yMax, hi) : hi + padY;
  if (opts.clampMin !== undefined) lo = Math.max(lo, opts.clampMin);
  if (opts.clampMax !== undefined) hi = Math.min(hi, opts.clampMax);

  const endLabel = fmt(real[real.length - 1].y);
  const refLabel = opts.reference ? opts.reference.label : '';
  const padL = 40, padT = 12, padB = 26;
  const padR = Math.ceil(Math.max(textW(endLabel, 11.5), textW(refLabel, 10.5))) + 18;
  const plotW = Math.max(40, width - padL - padR);
  const plotH = height - padT - padB;
  const X = i => padL + (points.length === 1 ? 0 : (i / (points.length - 1)) * plotW);
  const Y = v => padT + plotH - ((v - lo) / (hi - lo)) * plotH;

  let s = '';
  for (let k = 0; k <= 3; k++) {
    const v = lo + (hi - lo) * (k / 3);
    const y = Y(v);
    s += `<line x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" stroke="var(--grid)" stroke-width="1"/>`;
    s += `<text x="${padL - 7}" y="${y + 4}" text-anchor="end" font-size="10.5" `
       + `fill="var(--text-muted)" font-variant-numeric="tabular-nums">${esc(fmt(v))}</text>`;
  }
  if (opts.reference) {
    const ry = Y(opts.reference.value);
    s += `<line x1="${padL}" y1="${ry}" x2="${padL + plotW}" y2="${ry}" stroke="var(--text-muted)" stroke-width="1"/>`;
    // In the right gutter, clear of the data — a caption over the line itself
    // collides with the series exactly where the two matter most.
    s += `<text x="${padL + plotW + 8}" y="${ry + 3.5}" font-size="10.5" `
       + `fill="var(--text-muted)">${esc(refLabel)}</text>`;
  }

  const d = points.map((p, i) => (p.y === null || p.y === undefined) ? null : `${X(i)},${Y(+p.y)}`)
    .filter(Boolean).join(' ');
  s += `<polyline points="${d}" fill="none" stroke="${SLOT(1)}" stroke-width="2" `
     + `stroke-linejoin="round" stroke-linecap="round"/>`;

  points.forEach((p, i) => {
    if (p.y === null || p.y === undefined) return;
    const last = i === points.length - 1;
    s += `<circle cx="${X(i)}" cy="${Y(+p.y)}" r="${last ? 4.5 : 3}" fill="${SLOT(1)}" `
       + `stroke="var(--surface-1)" stroke-width="2"/>`;
  });
  const lx = X(points.length - 1), ly = Y(+real[real.length - 1].y);
  s += `<text x="${lx + 9}" y="${ly + 4}" font-size="11.5" fill="var(--text-primary)" `
     + `font-weight="600">${esc(endLabel)}</text>`;

  points.forEach((p, i) => {
    if (points.length > 8 && i % 2) return;
    s += `<text x="${X(i)}" y="${padT + plotH + 16}" text-anchor="middle" font-size="10.5" `
       + `fill="var(--text-muted)">${esc(p.x)}</text>`;
  });
  return frame(width, height, title, s);
}

/**
 * Stacked columns — part-to-whole across a handful of groups. Segments are
 * separated by a 2px gap in the surface colour, never by a stroke.
 *
 * groups: [{ label, parts: [n1, n2, n3] }]
 * series: [{ name, slot }]
 */
function stackedColumn(groups, series, opts = {}) {
  const width = opts.width || 640;
  const height = opts.height || 200;
  const title = opts.title || 'Chart';
  if (!groups.length) return frame(width, 40, title, '');

  const totals = groups.map(g => g.parts.reduce((a, b) => a + (+b || 0), 0));
  const max = niceMax(Math.max(1, ...totals));
  const padL = 34, padR = 8, padT = 8, padB = 26;
  const plotW = Math.max(40, width - padL - padR);
  const plotH = height - padT - padB;
  const band = plotW / groups.length;
  const thick = Math.min(24, band - 14);

  let s = '';
  for (let k = 0; k <= 2; k++) {
    const v = (max * k) / 2;
    const y = padT + plotH - (v / max) * plotH;
    s += `<line x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" stroke="var(--grid)" stroke-width="1"/>`;
    s += `<text x="${padL - 7}" y="${y + 4}" text-anchor="end" font-size="10.5" `
       + `fill="var(--text-muted)" font-variant-numeric="tabular-nums">${esc(fmtInt(v))}</text>`;
  }

  groups.forEach((g, gi) => {
    const x = padL + gi * band + (band - thick) / 2;
    let acc = 0;
    g.parts.forEach((v, si) => {
      const val = Math.max(0, +v || 0);
      if (!val) { acc += val; return; }
      const yBot = padT + plotH - (acc / max) * plotH;
      const hRaw = (val / max) * plotH;
      const gap = si === 0 ? 0 : 2;                     // 2px of surface between segments
      const hh = Math.max(0, hRaw - gap);
      const top = yBot - hRaw;
      const isTop = g.parts.slice(si + 1).every(x2 => !(+x2));
      s += isTop
        ? `<path d="${barPathV(x, top, thick, hh)}" fill="${SLOT(series[si].slot)}"/>`
        : `<rect x="${x}" y="${top}" width="${thick}" height="${hh}" fill="${SLOT(series[si].slot)}"/>`;
      acc += val;
    });
    s += `<text x="${x + thick / 2}" y="${padT + plotH + 16}" text-anchor="middle" font-size="10.5" `
       + `fill="var(--text-muted)">${esc(g.label)}</text>`;
  });
  s += `<line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" `
     + `stroke="var(--grid)" stroke-width="1"/>`;
  return frame(width, height, title, s);
}

/** A legend. Always rendered where there are two or more series. */
function legend(series) {
  return '<div class="legend">' + series.map(x =>
    `<span class="lg"><i style="background:${x.slot ? SLOT(x.slot) : (TONE[x.tone] || x.tone)}"></i>${esc(x.name)}</span>`
  ).join('') + '</div>';
}

/** A 12-point sparkline for a table cell. Current point in the accent hue. */
function sparkline(values, opts = {}) {
  const w = opts.width || 96, h = opts.height || 24;
  const v = values.filter(x => x !== null && x !== undefined && !Number.isNaN(+x)).map(Number);
  if (v.length < 2) return '';
  const lo = Math.min(...v), hi = Math.max(...v);
  const span = hi - lo || 1;
  const X = i => (i / (v.length - 1)) * (w - 6) + 3;
  const Y = x => h - 3 - ((x - lo) / span) * (h - 6);
  const d = v.map((x, i) => `${X(i)},${Y(x)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" `
       + `aria-label="${esc(opts.label || 'trend')}"><title>${esc(opts.label || 'trend')}</title>`
       + `<polyline points="${d}" fill="none" stroke="var(--text-muted)" stroke-width="1.6" `
       + `stroke-linejoin="round" stroke-linecap="round"/>`
       + `<circle cx="${X(v.length - 1)}" cy="${Y(v[v.length - 1])}" r="2.6" fill="${SLOT(1)}"/></svg>`;
}

/**
 * A meter — one ratio against a limit. The fill carries the state; the track is
 * a lighter step of the same ramp, so the whole bar reads even when nearly empty.
 */
function meter(pct, opts = {}) {
  const w = opts.width || 92, h = 8;
  const p = Math.max(0, Math.min(100, +pct || 0));
  const ok = opts.floor === undefined ? true : p >= opts.floor;
  const fill = ok ? SLOT(1) : 'var(--critical)';
  const track = ok ? 'rgba(42,120,214,.16)' : 'rgba(208,59,59,.16)';
  let s = `<rect x="0" y="0" width="${w}" height="${h}" rx="4" fill="${track}"/>`;
  s += `<rect x="0" y="0" width="${Math.max(2, (p / 100) * w)}" height="${h}" rx="4" fill="${fill}"/>`;
  if (opts.floor !== undefined) {
    const fx = (opts.floor / 100) * w;
    s += `<line x1="${fx}" y1="-2" x2="${fx}" y2="${h + 2}" stroke="var(--text-secondary)" stroke-width="1"/>`;
  }
  return `<svg class="meter" viewBox="0 -2 ${w} ${h + 4}" width="${w}" height="${h + 4}" role="img" `
       + `aria-label="${esc(opts.label || p + '%')}"><title>${esc(opts.label || p + '%')}</title>${s}</svg>`;
}

module.exports = { hbar, line, stackedColumn, legend, sparkline, meter, niceMax, fmtInt };

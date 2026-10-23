// Koishi. Pure structural features, milliseconds in/out.
// No title, filename, mapper, source platform, BPM label or benchmark label is used.
import { handFeatures } from './hand-features.js';
import { tapFeatures } from './tap-features.js';
import { loadFeatures } from './load-features.js';
export const FEATURE_VERSION = 'koishi-4';
export const SKILLS = ['speed', 'jack', 'chord', 'tech', 'ln', 'physical'];
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
const quantile = (a, q) => {
  if (!a.length) return 0;
  const p = (a.length - 1) * q, i = Math.floor(p);
  return a[i] + (a[Math.min(i + 1, a.length - 1)] - a[i]) * (p - i);
};
const bitCount = m => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);
function summarize(out, name, values) {
  const a = [...values].sort((a, b) => a - b);
  out[name + '_mean'] = mean(a);
  for (const q of [.5, .9, .98, 1]) out[name + '_p' + Math.round(q * 100)] = quantile(a, q);
}
function rolling(values, width) {
  const out = []; let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]; if (i >= width) sum -= values[i - width];
    // Full width also at the beginning: a one-note burst is not a full window.
    out.push(sum / width);
  }
  return out;
}

export function extractFeatures(parsed, { rate = 1, includeTimeline = false, timeWarp = null } = {}) {
  if (parsed?.keys !== 4) throw new Error('UnsupportedKeys: 当前校准仅支持 4K');
  if (parsed.general && parsed.general.mode !== 3) throw new Error('NotMania');
  if (!Number.isFinite(rate) || rate <= 0 || rate > 4) throw new Error('InvalidRate');
  if (timeWarp !== null && typeof timeWarp !== 'function') throw new Error('InvalidTimeWarp');
  if (!Array.isArray(parsed.notes)) throw new Error('InvalidNotes');
  const byTime = new Map();
  for (const n of parsed.notes) {
    if (!Number.isFinite(n.t) || !Number.isInteger(n.col) || n.col < 0 || n.col > 3 ||
        (n.end != null && (!Number.isFinite(n.end) || n.end < n.t))) throw new Error('InvalidNotes');
    if (!byTime.has(n.t)) byTime.set(n.t, new Map());
    const row = byTime.get(n.t);
    row.set(n.col, Math.max(row.get(n.col) ?? n.t, n.end ?? n.t));
  }
  const entries = [...byTime].sort((a, b) => a[0] - b[0]);
  const count = entries.reduce((s, [, cols]) => s + cols.size, 0);
  if (count < 32) throw new Error('TooShort: 至少需要 32 个note');
  const origin = entries[0][0];
  /* 时间扭曲（SV 自适应）：先把绝对时刻折算成读谱时间，再走原来的 /rate。
     不传 timeWarp 时与旧行为逐比特一致；整谱 sv ≡ k 时扭曲就是 t/k，
     于是本函数的输入与 rate=k 完全相同 —— 读谱特征逐比特一致。
     （耐力/锚度那一路在 indices-features，按设计不参与 SV 折算，见 sv-adaptive.js 注释。） */
  const warped = timeWarp === null ? null : (t => timeWarp(t - origin));
  const rows = entries.map(([time, cols]) => ({ t: warped ? warped(time) : (time - origin) / rate,
    notes: [...cols].map(([col, end]) => ({ col, end: warped ? warped(end) : (end - origin) / rate })),
    mask: [...cols.keys()].reduce((m, c) => m | (1 << c), 0) }));
  const end = rows.reduce((m, r) => Math.max(m, ...r.notes.map(n => n.end)), 0);
  if (end > 7200000) throw new Error('TooLong: 最大支持两小时');
  const binCount = Math.floor(end / 500) + 1;
  const bins = Object.fromEntries([...SKILLS, 'heads', 'rows', 'hold'].map(k => [k, new Float64Array(binCount)]));
  const last = Array(4).fill(-Infinity), lastIndex = Array(4).fill(-1), chain = Array(4).fill(0);
  const held = Array(4).fill(-Infinity), lanes = [0, 0, 0, 0], chords = [0, 0, 0, 0, 0];
  const fingerRates = [], rowRates = [], gaps = [], holdLengths = [], releaseGaps = [];
  let repeats = 0, handJacks = 0, switches = 0, alternations = 0, rhythm = 0, holdHeads = 0, heldPresses = 0;
  let overlap = 0, previousDt = 0, previousMask = 0;
  const intervalHistogram = new Map();
  rows.forEach((r, i) => {
    const b = Math.floor(r.t / 500), size = r.notes.length;
    const dt = i ? r.t - rows[i - 1].t : 1000;
    const hz = 1000 / (dt + 25), continuous = i > 0 && dt <= 500;
    let jack = 0, physical = 0, repeated = 0;
    const holding = held.filter(t => t > r.t).length;
    const irregular = continuous && previousDt > 0 && previousDt <= 500
      ? Math.min(2, Math.abs(Math.log2(dt / previousDt))) : 0;
    for (const n of r.notes) {
      const gap = r.t - last[n.col], finiteGap = Number.isFinite(gap) ? gap : 1000;
      const fingerHz = 1000 / (finiteGap + 30);
      if (Number.isFinite(gap)) fingerRates.push(fingerHz);
      const direct = continuous && lastIndex[n.col] === i - 1;
      const handJack = gap <= 500 && last[n.col ^ 1] <= last[n.col];
      if (direct) { repeats++; repeated++; }
      if (handJack) handJacks++;
      if (gap <= 500 && last[n.col ^ 1] > last[n.col]) switches++;
      chain[n.col] = direct ? chain[n.col] + 1 : 0;
      jack += (direct ? 1 : handJack ? .55 : 0) * Math.pow(fingerHz / 5, .65) * (1 + .08 * Math.min(chain[n.col], 12));
      physical += Math.pow(fingerHz / 5, .35) * (1 + .15 * (size - 1));
      if (held[n.col] > r.t) overlap++;
      if (held[n.col] >= 0 && held[n.col] <= r.t) {
        releaseGaps.push(1000 / (r.t - held[n.col] + 30));
        held[n.col] = -Infinity;
      }
      if (n.end > r.t) {
        holdHeads++; holdLengths.push((n.end - r.t) / 1000);
        // Integrate held fingers exactly, including portions of the first/last bin.
        for (let j = b; j <= Math.floor(n.end / 500); j++) {
          bins.hold[j] += Math.max(0, Math.min(n.end, (j + 1) * 500) - Math.max(r.t, j * 500)) / 500;
        }
        bins.ln[Math.floor(n.end / 500)] += .65;
        held[n.col] = n.end;
      }
      lanes[n.col]++;
    }
    // Update only after all notes in this chord: column ordering is not hand timing.
    for (const n of r.notes) { last[n.col] = r.t; lastIndex[n.col] = i; }
    const maskChange = continuous ? bitCount(r.mask ^ previousMask) / 4 : 0;
    if (continuous && size === 1 && bitCount(previousMask) === 1 && !(r.mask & previousMask)) alternations++;
    if (holding) heldPresses += size;
    bins.heads[b] += size * 2; bins.rows[b] += 2;
    bins.speed[b] += 2 * Math.pow(size, .3) * Math.pow(hz / 8, .35) * (1 - .6 * repeated / size);
    bins.jack[b] += 2 * jack;
    bins.chord[b] += 2 * Math.max(0, size - 1) * Math.pow(hz / 8, .35);
    bins.tech[b] += 2 * Math.pow(hz / 8, .35) * (irregular * size + .35 * maskChange * size);
    bins.physical[b] += 2 * physical;
    bins.ln[b] += 2 * (r.notes.filter(n => n.end > r.t).length * .7 + holding * size * .3);
    chords[size]++;
    if (i) { rowRates.push(1000 / dt); gaps.push(dt); }
    if (continuous) {
      const k = Math.round(Math.log2(dt) * 8);
      intervalHistogram.set(k, (intervalHistogram.get(k) || 0) + 1);
      rhythm += irregular;
    }
    previousDt = dt; previousMask = r.mask;
  });
  const features = { duration: end / 1000, logNotes: Math.log1p(count), lnRatio: holdHeads / count,
    chordSize: count / rows.length, jackRatio: repeats / count, handJackRatio: handJacks / count,
    switchRatio: switches / count, alternationRatio: alternations / rows.length,
    rhythmChange: rhythm / rows.length, heldPressRatio: heldPresses / count,
    laneImbalance: (Math.max(...lanes) - Math.min(...lanes)) / count,
    handImbalance: Math.abs(lanes[0] + lanes[1] - lanes[2] - lanes[3]) / count,
    restRatio: bins.heads.filter(v => v === 0).length / binCount };
  for (let i = 1; i <= 4; i++) features['chord' + i + 'Ratio'] = chords[i] / rows.length;
  const histTotal = [...intervalHistogram.values()].reduce((s, n) => s + n, 0);
  features.rhythmEntropy = [...intervalHistogram.values()].reduce((s, n) => s - n / histTotal * Math.log2(n / histTotal), 0);
  summarize(features, 'fingerHz', fingerRates); summarize(features, 'rowHz', rowRates);
  summarize(features, 'holdSeconds', holdLengths); summarize(features, 'releaseHz', releaseGaps);
  for (const [name, values] of Object.entries(bins)) {
    for (const seconds of [2, 8, 30]) summarize(features, name + seconds, rolling(values, seconds * 2));
  }
  // Fatigue accumulates under high physical load and recovers through real breaks.
  let fatigue = 0;
  const fatigueSeries = Array.from(bins.physical, load => {
    const drive = Math.pow(Math.max(0, load - 6) / 10, 1.5);
    const tau = load > 6 ? 20 : 8;
    fatigue = fatigue * Math.exp(-.5 / tau) + drive * (1 - Math.exp(-.5 / tau));
    return fatigue;
  });
  summarize(features, 'fatigue', fatigueSeries);
  const hand = handFeatures(rows,binCount,includeTimeline);
  Object.assign(features,hand.features);
  Object.assign(features,tapFeatures(rows));
  Object.assign(features,loadFeatures(rows));
  const skillPressure = Object.fromEntries(SKILLS.map(k => [k, hand.pressure[k]]));
  skillPressure.stamina = hand.pressure.fatigue;
  const warnings = [];
  if (overlap) warnings.push(`${overlap} 个note与同轨未结束长条重叠，估值可能不可靠`);
  if (end < 10000) warnings.push('有效跨度不足十秒，短谱估值不稳定');
  return { version: FEATURE_VERSION, features, skillPressure, noteCount: count, rowCount: rows.length,
    durationMs: end, warnings, ...(includeTimeline ? { timeline: { originMs: origin, stepMs: 500,
      rate, skills: Object.fromEntries(Object.entries(bins).map(([k, v]) => [k, Array.from(v)])), hands: hand.timeline, fatigue: fatigueSeries } } : {}) };
}

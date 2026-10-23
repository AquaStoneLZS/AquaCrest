// Browser port of ef-relative-1/features.py. Only deduplicated note heads enter these features.
export const FEATURE_VERSION = 'ef-relative-1';
const clip = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const sum = a => a.reduce((s, x) => s + x, 0);
const quantile = (a, q) => {
  const v = [...a].sort((x, y) => x - y), pos = (v.length - 1) * q, i = Math.floor(pos);
  return v[i] + (v[Math.min(i + 1, v.length - 1)] - v[i]) * (pos - i);
};
function weightedQuantile(values, weights, q) {
  const order = Array.from(values, (v, i) => i).sort((i, j) => values[i] - values[j]);
  const target = q * sum(weights); let cumulative = 0;
  for (const i of order) { cumulative += weights[i]; if (cumulative >= target) return values[i]; }
  return values[order.at(-1)];
}
function summarize(out, key, values, weights) {
  out[key + '_mean'] = sum(values.map((x, i) => x * weights[i])) / sum(weights);
  out[key + '_p90'] = weightedQuantile(values, weights, .9);
}

export function readAquaHeads(text, rate = 1) {
  if (!Number.isFinite(rate) || rate < .25 || rate > 3) throw Error('播放倍速必须在 0.25–3 之间');
  const sections = {}; let section = '';
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r\n?|\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('//') || line.startsWith('osu file format')) continue;
    if (line.startsWith('[') && line.endsWith(']')) section = line.slice(1, -1);
    else (sections[section] ??= []).push(line);
  }
  const kv = name => Object.fromEntries((sections[name] ?? []).filter(x => x.includes(':')).map(x => {
    const i = x.indexOf(':'); return [x.slice(0, i), x.slice(i + 1).trim()];
  }));
  if (kv('General').Mode !== '3' || Number(kv('Difficulty').CircleSize ?? NaN) !== 4)
    throw Error('AquaTide / AquaReef 仅支持原生 osu!mania 4K（Mode=3、CircleSize=4）');
  const occupied = new Map();
  for (const line of sections.HitObjects ?? []) {
    const p = line.split(','), x = Number(p[0]), t = Number(p[2]), kind = Number(p[3]);
    if (p.length < 5 || !p[0].trim() || !p[2].trim() || !p[3].trim() || !Number.isInteger(kind))
      throw Error('AquaTide / AquaReef：物件格式无效');
    if (!Number.isFinite(x) || x < 0 || x > 512 || !Number.isFinite(t)) throw Error('AquaTide / AquaReef：键位坐标或时间戳无效');
    if (!(kind & 1 || kind & 128) || kind & (2 | 8)) throw Error('AquaTide / AquaReef：不支持该物件类型');
    if (kind & 128) {
      const end = Number(p[5]?.split(':')[0] ?? NaN);
      if (!p[5]?.split(':')[0].trim() || !Number.isFinite(end) || end < t) throw Error('AquaTide / AquaReef：长条尾部无效');
    }
    const col = Math.min(3, Math.floor(x * 4 / 512)); occupied.set(`${t}:${col}`, [t, col]);
  }
  const heads = [...occupied.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (heads.length < 80) throw Error('AquaTide / AquaReef 至少需要 80 个去重note');
  const origin = heads[0][0], duration = heads.at(-1)[0] - origin;
  if (duration <= 0 || duration > 86400000) throw Error('AquaTide / AquaReef：谱面时长无效或超过 24 小时');
  return heads.map(([t, col]) => [(t - origin) / rate, col]);
}

function anchorHand(notes) {
  const times = [...new Set(notes.map(n => n[0]))];
  const unit = times.length > 1 ? quantile(times.slice(1).map((x, i) => x - times[i]), .5) : 1;
  const t = times.map(x => (x - times[0]) / Math.max(unit, 1e-12));
  const lookup = new Map(times.map((x, i) => [x, i])), rows = times.map(() => [0, 0]);
  for (const [time, c] of notes) rows[lookup.get(time)][c % 2] = 1;
  let previous = [0, 0]; const load = [], repeat = [], signed = [], weights = [];
  for (let i = 0; i < rows.length; i++) {
    const gap = i ? t[i] - t[i - 1] : 1, decay = Math.exp(-Math.min(700, gap / 2));
    previous = rows[i].map((v, c) => previous[c] * decay + v); load.push(previous);
    repeat.push(rows[i].map((v, c) => v * (i ? rows[i - 1][c] : 0) * Number(gap <= 4 + 1e-9)));
    signed.push((previous[0] - previous[1]) / Math.max(sum(previous), 1e-12)); weights.push(sum(rows[i]));
  }
  const output = {}; summarize(output, 'load_gap', signed.map(Math.abs), weights);
  for (const width of [8, 16, 32, 64, 128]) {
    const values = {count_gap: [], repeat_gap: [], recovery_gap: [], persistent_gap: []}, w = [];
    for (let start = 0; start < rows.length; start += width / 4) {
      const stop = Math.min(rows.length, start + width);
      if (stop - start < Math.min(width / 2, rows.length)) continue;
      const counts = [0, 0], rr = [0, 0], free = [0, 0]; let persistence = 0;
      for (let c = 0; c < 2; c++) {
        let boundary = t[start];
        for (let i = start; i < stop; i++) {
          counts[c] += rows[i][c]; rr[c] += repeat[i][c];
          if (rows[i][c]) { free[c] += Math.max(0, t[i] - boundary - 1); boundary = t[i]; }
        }
        free[c] += Math.max(0, t[stop - 1] + 1 - boundary - 1);
      }
      const total = sum(counts);
      for (let i = start; i < stop; i++) persistence += signed[i] * weights[i];
      values.count_gap.push(Math.abs(counts[0] - counts[1]) / total);
      values.repeat_gap.push(Math.abs(rr[0] - rr[1]) / total);
      values.recovery_gap.push(Math.abs(free[0] - free[1]) / Math.max(1e-12, t[stop - 1] - t[start] + 1));
      values.persistent_gap.push(Math.abs(persistence / total)); w.push(total);
    }
    for (const [k, v] of Object.entries(values)) summarize(output, `w${width}_${k}`, v, w);
  }
  return [output, notes.length];
}

const boundedSeconds = x => x <= 180 ? x : 180 + 20 * -Math.expm1(-(x - 180) / 20);
function occupancy(times, edges) {
  const starts = [], ends = [], prefix = [0];
  for (const t of times) {
    if (ends.length && t <= ends.at(-1)) ends[ends.length - 1] = Math.max(ends.at(-1), t + .2);
    else { starts.push(t); ends.push(t + .2); }
  }
  for (let i = 0; i < starts.length; i++) prefix.push(prefix.at(-1) + ends[i] - starts[i]);
  const result = new Float64Array(edges.length - 1); let index = -1, previous = 0;
  for (let i = 0; i < edges.length; i++) {
    while (index + 1 < starts.length && starts[index + 1] <= edges[i]) index++;
    const covered = index < 0 ? 0 : prefix[index] + clip(edges[i] - starts[index], 0, ends[index] - starts[index]);
    if (i) result[i - 1] = clip((covered - previous) / (edges[i] - edges[i - 1]));
    previous = covered;
  }
  return result;
}
function enduranceHand(notes) {
  const t = notes.map(n => Math.round((n[0] - notes[0][0]) * 1e6) / 1e9), duration = t.at(-1) + .2;
  const bins = Math.ceil(duration * 10 - 1e-8), edges = Array.from({length: bins}, (_, i) => i / 10); edges.push(duration);
  const dt = edges.slice(1).map((x, i) => x - edges[i]);
  const finger = [0, 1].map(c => occupancy(t.filter((_, i) => notes[i][1] % 2 === c), edges));
  const busy = occupancy([...new Set(t)], edges), rest = busy.map(x => 1 - x), single = busy.map((x, i) => clip(2 * x - finger[0][i] - finger[1][i]));
  const counts = new Float64Array(bins), pressure = new Float64Array(bins);
  for (const time of t) counts[Math.min(bins - 1, Math.floor(time * 10 + 1e-8))]++;
  let rolling = 0, elapsed = 0;
  for (let i = 0; i < bins; i++) { rolling += counts[i] - (i >= 10 ? counts[i - 10] : 0); elapsed += dt[i]; pressure[i] = rolling / Math.min(elapsed, 1); }
  const positive = [], positiveWeights = [];
  for (let i = 0; i < bins; i++) if (pressure[i] > 0) { positive.push(pressure[i]); positiveWeights.push(dt[i]); }
  const reference = weightedQuantile(positive, positiveWeights, .9), relative = pressure.map(x => Math.min(1.5, x / Math.max(reference, 1e-12)));
  const duty = busy.map((x, i) => x * Math.min(1, relative[i] ** 4));
  let effective = 0, dose = 0, restTotal = 0, singleTotal = 0, run = 0, peakRun = 0;
  const ending = [0, 0], peaks = [0, 0];
  for (let i = 0; i < bins; i++) {
    const q = relative[i], seconds = dt[i], drive = Math.max(Math.max(0, (q - .7) / .3) ** 2, .25 * duty[i]);
    const recovery = rest[i] + .35 * busy[i] * Math.max(0, 1 - q ** 2) ** 2 + .125 * single[i] / (1 + q ** 2);
    effective += duty[i] * seconds; dose += drive * seconds; restTotal += rest[i] * seconds; singleTotal += single[i] / (1 + q ** 2) * seconds;
    run = Math.max(0, run + (duty[i] - 3 * rest[i]) * seconds); peakRun = Math.max(peakRun, run);
    for (const [j, rise, decay] of [[0, 30, 15], [1, 90, 120]]) {
      if (recovery > 1e-12) { const a = Math.exp(-recovery * seconds / decay); ending[j] = ending[j] * a + drive * decay / recovery / rise * (1 - a); }
      else ending[j] += drive * seconds / rise;
      peaks[j] = Math.max(peaks[j], ending[j]);
    }
  }
  const out = {work: boundedSeconds(effective) / 180, dose: boundedSeconds(dose) / 180, continuous: boundedSeconds(peakRun) / 180,
    fatigue_short: boundedSeconds(peaks[0] * 30) / 180, fatigue_long: boundedSeconds(peaks[1] * 90) / 180,
    duty: effective / duration, joint_rest: restTotal / duration, single_recovery: singleTotal / duration, relative_peak: weightedQuantile(relative, dt, .9)};
  for (const window of [10, 30, 60]) {
    const width = Math.min(bins, window * 10), duties = [], rests = []; let seconds = 0, work = 0, free = 0;
    for (let i = 0; i < bins; i++) {
      seconds += dt[i]; work += duty[i] * dt[i]; free += rest[i] * dt[i];
      if (i >= width) { seconds -= dt[i - width]; work -= duty[i - width] * dt[i - width]; free -= rest[i - width] * dt[i - width]; }
      if (i >= width - 1) { duties.push(work / seconds); rests.push(free / seconds); }
    }
    out[`local${window}_duty`] = quantile(duties, .9); out[`local${window}_rest`] = quantile(rests, .1);
  }
  return [out, Math.max(effective, 1e-12)];
}

export function extractAquaFeatures(heads) {
  const hands = [];
  for (let hand = 0; hand < 2; hand++) {
    const notes = heads.filter(n => Math.floor(n[1] / 2) === hand); if (!notes.length) continue;
    const [F, weightF] = anchorHand(notes), [E, weightE] = enduranceHand(notes);
    hands.push({hand, F, E, weightF, weightE});
  }
  for (const label of ['E', 'F']) { const total = sum(hands.map(h => h['weight' + label])); for (const h of hands) h['weight' + label] /= total; }
  return hands;
}

export const RC_LN_RATIO_LIMIT = .18;

// Check the original chart before head-only conversion or time rounding.
export function assertLnScope(parsed, algorithm) {
  const notes = parsed?.notes ?? [];
  const holds = notes.filter(note => (note.type & 128) || (note.end != null && note.end > note.t)).length;
  if (notes.length && holds / notes.length > RC_LN_RATIO_LIMIT)
    throw Error(`UnsupportedLN: ${algorithm} 不计算长条占比超过 18% 的谱面。`);
}

// Roxy's numeric output interval is [11, 17).
export function koishiScope(difficulty) {
  if (difficulty < 11) return {code:'BelowScope', label:'< Alpha Low', reason:'Koishi 仅计算 11 ≤ 定数 < 17；预测低于 11，不输出难度。'};
  if (difficulty >= 17) return {code:'AboveScope', label:'> Emik Zeta high', reason:'Koishi 仅计算 11 ≤ 定数 < 17；预测达到或超过 17，不输出难度。'};
  return null;
}

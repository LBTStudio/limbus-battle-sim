import type { ParsedRoll, LbtUnit, DuelResult, RoundResult, Matchup, AtkType, ResLabel, Persona } from "./types";

export function parseRoll(text: string, effect = ""): ParsedRoll {
  const t = text.replace(/\s/g, "");
  const indestructible = t.includes("破壊不能") || effect.includes("破壊不能");
  const core = indestructible ? t.replace(/破壊不能/g, "") : t;
  let invert = false, n = 0, m = 0, add = 0;
  let mm = core.match(/^(\d+)-(\d+)d(\d+)$/);
  if (mm) { invert = true; [n] = [+mm[1], +mm[2]]; m = +mm[3]; }
  if (!mm) {
    mm = core.match(/^(\d+)d(\d+)([+-]\d+)?$/);
    if (mm) { n = +mm[1]; m = +mm[2]; add = mm[3] ? +mm[3] : 0; }
  }
  if (!mm) { mm = core.match(/^(\d+)d(\d+)$/); if (mm) { n = +mm[1]; m = +mm[2]; } }
  if (!mm) throw new Error(`unparseable roll: ${text}`);
  return { text, n, m, add, invert, indestructible };
}

export function rollOne(p: ParsedRoll): number {
  if (p.invert) return p.n - sumDice(p) ;
  return p.n === 0 ? p.add : p.n * 0 + p.add + sumDice(p);
}

function sumDice(p: ParsedRoll): number {
  let s = 0;
  for (let i = 0; i < p.n; i++) s += 1 + Math.floor(Math.random() * p.m);
  return s;
}

export const RES_MULT: Record<ResLabel, { add: number; mul: number }> = {
  脆弱: { add: 0, mul: 2 },
  弱点: { add: 5, mul: 1 },
  普通: { add: 0, mul: 1 },
  抵抗: { add: -5, mul: 1 },
  耐性: { add: -10, mul: 1 },
  免疫: { add: 0, mul: 0 },
};

export function toAtkType(type: string): AtkType {
  return (["斬撃", "貫通", "打撃"].find((a) => type.startsWith(a)) ?? "打撃") as AtkType;
}

export function baseAtk(t: AtkType): "slash" | "pierce" | "blunt" {
  return t.startsWith("斬") ? "slash" : t.startsWith("貫") ? "pierce" : "blunt";
}

// 加算 → 乗算 order
export function applyResist(raw: number, label: ResLabel): number {
  const r = RES_MULT[label];
  return Math.max(0, (raw + r.add) * r.mul);
}

export function duel(
  units: Map<string, LbtUnit>,
  m: Matchup,
  rollProb: (die: { roll: string; effect: string }) => ParsedRoll,
): DuelResult {
  const a = units.get(m.attackerId)!;
  const d = units.get(m.defenderId)!;
  const aDice = a.persona.skills.flatMap((s) => s.dice);
  const skillIdx = Math.min(m.duelIndex, aDice.length - 1);
  const aRollP = rollProb(aDice[skillIdx]);
  // defender counters with first available defense-ish dice if any else nothing
  const dDice = d.persona.skills.flatMap((s) => s.dice);
  const dRollP = dDice[m.duelIndex] ? rollProb(dDice[m.duelIndex]) : null;
  let aTotal = rollOne(aRollP);
  let dTotal = dRollP ? rollOne(dRollP) : -1;
  let winner: DuelResult["winner"] = aTotal > dTotal ? "attacker" : aTotal < dTotal ? "defender" : "tie";
  // 同値: 出目が小さい方を破壊(表記上は敗北しない)=引き分けは攻撃成立なし
  const atkType = baseAtk(toAtkType(a.persona.skills[Math.min(Math.floor(m.duelIndex / 4), a.persona.skills.length - 1)]?.type ?? "打撃"));
  const resist = d.persona[`res_${atkType}` as "res_slash"];
  const rawWin = Math.max(0, aTotal - Math.max(dTotal, 0));
  const attackDamage = winner === "attacker" ? applyResist(rawWin, resist) : 0;
  const sanDamage = winner === "attacker" ? rawWin : 0;
  const defensiveDamage = winner === "defender" ? Math.max(0, dTotal - Math.max(aTotal, 0)) : 0;
  return {
    matchup: m,
    attackerName: a.persona.name,
    defenderName: d.persona.name,
    attackerRoll: aRollP.text,
    defenderRoll: dRollP?.text ?? "-",
    attackerTotal: aTotal,
    defenderTotal: dTotal,
    winner,
    attackDamage,
    sanDamage,
    defensiveDamage,
  };
}

export function resolveRound(
  ally: LbtUnit[],
  enemy: LbtUnit[],
  assignments: (Matchup | null)[],
  rollProb: (die: { roll: string; effect: string }) => ParsedRoll,
): RoundResult {
  const all = [...ally, ...enemy];
  const units = new Map(all.map((u) => [u.id, u]));
  const withSpeed = all.map((u) => ({ u, sp: rollOne(rollProb({ roll: u.persona.speed, effect: "" })) }));
  withSpeed.sort((a, b) => b.sp - a.sp); // 同速度は敵(後半)先行: stable sort keeps enemy later on ties
  const slots = Array.from({ length: assignments.length }, (_, i) => ({ m: assignments[i], sp: withSpeed[i]?.sp ?? 0 }))
    .sort((a, b) => b.sp - a.sp);
  const duels = slots.filter((s) => s.m).map((s) => duel(units, s.m!, rollProb));
  return { order: slots.map((s) => s.m), duels };
}

export function personaToJson(p: Persona): string {
  return JSON.stringify(p);
}

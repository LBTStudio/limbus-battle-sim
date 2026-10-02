export interface ParsedRoll {
  text: string;
  n: number;
  m: number;
  add: number;
  invert: boolean; // "16-1d10"
  indestructible: boolean;
}

export type AtkType = "斬撃" | "貫通" | "打撃" | "斬撃反撃" | "貫通反撃" | "打撃反撃";
export type ResLabel = "脆弱" | "弱点" | "普通" | "抵抗" | "耐性" | "免疫";

export interface Skill {
  rank: string; // スキル0..4
  type: string;
  sin: string;
  name: string;
  effect: string;
  dice: { roll: string; effect: string }[];
}

export interface Persona {
  name: string;
  no: number;
  hp: number;
  san: number;
  speed: string; // "1d5"
  res_slash: ResLabel;
  res_pierce: ResLabel;
  res_blunt: ResLabel;
  passive_name: string;
  passive_effect: string;
  skills: Skill[];
  affiliation: string;
}

export interface LbtUnit {
  id: string;
  source: "official" | "sync" | "enemy";
  persona: Persona;
  speedValue?: number; // rolled speed for the round
}

export interface Matchup {
  attackerId: string;
  duelIndex: number; // index of the duel (dice slot in that skill)
  defenderId: string;
}

export interface DuelResult {
  matchup: Matchup;
  attackerName: string;
  defenderName: string;
  attackerRoll: string;
  defenderRoll: string;
  attackerTotal: number;
  defenderTotal: number;
  winner: "attacker" | "defender" | "tie";
  attackDamage: number; // vs defender HP
  sanDamage: number; // vs defender SAN
  defensiveDamage: number; // defender's residual dice vs attacker HP
}

export interface RoundResult {
  order: (Matchup | null)[]; // speed-desc slots
  duels: DuelResult[];
}

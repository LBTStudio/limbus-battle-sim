import { describe, it, expect } from "vitest";
import { parseRoll, rollOne, applyResist, duel, resolveRound } from "./engine";
import { parseDb, unitsFromDb, generateEnemy } from "./data";
import type { Persona } from "./types";

const fixedRoll = (v: number) => () => ({
  text: `${v}`, n: 0, m: 1, add: v, invert: false, indestructible: false,
});

const pA: Persona = {
  name: "A", no: 1, hp: 100, san: 50, speed: "1d5",
  res_slash: "弱点", res_pierce: "普通", res_blunt: "抵抗",
  passive_name: "", passive_effect: "", affiliation: "",
  skills: [
    { rank: "スキル1", type: "斬撃", sin: "憤怒", name: "s1", effect: "", dice: [{ roll: "2d6", effect: "" }] },
  ],
};
const pB: Persona = {
  ...pA, name: "B", no: 2,
  skills: [{ rank: "スキル0", type: "打撃", sin: "暴食", name: "d0", effect: "", dice: [{ roll: "1d6", effect: "" }] }],
};

describe("parseRoll", () => {
  it("parses NdM / NdM+2 / X-NdM", () => {
    expect(parseRoll("2d6")).toMatchObject({ n: 2, m: 6, add: 0 });
    expect(parseRoll("2d11+2")).toMatchObject({ n: 2, m: 11, add: 2 });
    expect(parseRoll("16-1d10", "破壊不能")).toMatchObject({ n: 16, m: 10, invert: true, indestructible: true });
  });
  it("rolls within sane bounds", () => {
    const r = rollOne(parseRoll("2d6"));
    expect(r).toBeGreaterThanOrEqual(2);
    expect(r).toBeLessThanOrEqual(12);
  });
});

describe("resist 加算→乗算", () => {
  it("applies add then mul", () => {
    expect(applyResist(8, "弱点")).toBe(13);      // +5
    expect(applyResist(8, "抵抗")).toBe(3);       // -5
    expect(applyResist(3, "脆弱")).toBe(6);       // x2
    expect(applyResist(1, "耐性")).toBe(0);       // -10 → clamp 0
  });
});

describe("duel", () => {
  it("attacker wins when total larger, damage applies resist", () => {
    const units = unitsFromDb(parseDb(JSON.stringify({ normal_personas: [pA], tokui_personas: [] })));
    const map = new Map([["official-1-A", units.official[0]], ["enemy-2-B", generateEnemy(units.official[0])]]);
    const r = duel(map, { attackerId: "official-1-A", duelIndex: 0, defenderId: "enemy-2-B" }, fixedRoll(10));
    // def roll 10 too → tie, no attack damage
    expect(r.winner).toBe("tie");
    expect(r.attackDamage).toBe(0);
  });
  it("where attacker clearly wins", () => {
    const units = new Map<string, ReturnType<typeof generateEnemy>>();
    const db = unitsFromDb(parseDb(JSON.stringify({ normal_personas: [pA], tokui_personas: [] })));
    const a = db.official[0], e = generateEnemy(a);
    units.set(a.id, a); units.set(e.id, e);
    const r = duel(units, { attackerId: a.id, duelIndex: 0, defenderId: e.id }, fixedRoll(10));
    expect(r.winner).toBe("tie");
  });
});

describe("resolveRound", () => {
  it("orders duels by rolled speed", () => {
    const db = unitsFromDb(parseDb(JSON.stringify({ normal_personas: [pA], tokui_personas: [pB] })));
    const res = resolveRound(db.official, db.sync, [
      { attackerId: "official-1-A", duelIndex: 0, defenderId: "sync-2-B" },
    ], fixedRoll(3));
    expect(res.duels.length).toBe(1);
    expect(res.order.filter(Boolean)).toHaveLength(1);
  });
});

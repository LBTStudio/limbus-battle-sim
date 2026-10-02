import { useMemo, useState } from "react";
import type { LbtUnit, Matchup, Persona } from "./types";
import { resolveRound, parseRoll } from "./engine";
import { parseDb, unitsFromDb, loadSyncUnits, addSyncUnit, generateEnemy, fetchOfficialDb } from "./data";
import "./styles.css";

type Side = "ally" | "enemy";

function resBadge(label: string) {
  if (!label) return null;
  const cls = label === "脆弱" || label === "弱点" ? "weak" : "resist2";
  return <span className={`res-badge ${cls}`}>{label}</span>;
}

export default function App() {
  const [official, setOfficial] = useState<LbtUnit[]>([]);
  const [sync, setSync] = useState<LbtUnit[]>(() => loadSyncUnits());
  const [affiliation, setAffiliation] = useState("");
  const [dbUrl, setDbUrl] = useState("");
  const [ally, setAlly] = useState<LbtUnit[]>([]);
  const [enemy, setEnemy] = useState<LbtUnit[]>([]);
  const [assignments, setAssignments] = useState<(Matchup | null)[]>([]);
  const [result, setResult] = useState<ReturnType<typeof resolveRound> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<Side | null>(null);
  const [vitals, setVitals] = useState<Record<string, { hp: number; san: number }>>({});

  const all = useMemo(() => [...official, ...sync], [official, sync]);
  const board = useMemo(() => [...ally, ...enemy], [ally, enemy]);
  const affiliations = useMemo(
    () => [...new Set(all.map((u) => u.persona.affiliation).filter(Boolean))],
    [all],
  );

  const slots = useMemo(() => {
    const list: { unit: LbtUnit; duelIndex: number; label: string; roll: string; skillName: string; atk: string }[] = [];
    for (const u of board) {
      let idx = 0;
      for (const s of u.persona.skills) {
        for (const d of s.dice) {
          list.push({
            unit: u, duelIndex: idx,
            label: `${u.persona.name}/${s.name} [${d.roll}]`,
            roll: d.roll, skillName: s.name,
            atk: s.type.startsWith("斬") ? "slash" : s.type.startsWith("貫") ? "pierce" : "blunt",
          });
          idx++;
        }
      }
    }
    return list;
  }, [board]);

  async function loadDbFromUrl() {
    setError(null);
    try {
      const { official: o, sync: s } = unitsFromDb(await fetchOfficialDb(dbUrl));
      setOfficial(o);
      let cur = sync;
      for (const u of s) {
        if (!cur.some((p) => p.id === u.id)) cur = addSyncUnit(u);
      }
      setSync(cur);
      if (!o.length) setError("公式人格(normal_personas)が0件でした。db.jsonのURLを確認してください。");
    } catch (e) {
      setError(String(e));
    }
  }

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const { official: o, sync: s } = unitsFromDb(parseDb(await f.text()));
      if (o.length) setOfficial(o);
      let cur = sync;
      for (const u of s) {
        if (!cur.some((p) => p.id === u.id)) cur = addSyncUnit(u);
      }
      setSync(cur);
      if (!o.length && !s.length) setError("人格データが見つかりませんでした");
    } catch (err) {
      setError(String(err));
    }
  }

  function addPersona(side: Side, p: Persona) {
    const base: LbtUnit = { id: `${side}-${p.no}-${p.name}`, source: side === "enemy" ? "enemy" : "sync", persona: p };
    const u = side === "enemy" ? generateEnemy({ ...base, source: "official" }) : base;
    if (side === "ally") setAlly((prev) => [...prev, u]);
    else setEnemy((prev) => [...prev, u]);
    setAssignments([]);
    setResult(null);
    setPicking(null);
  }

  function resolve() {
    const a = Array.from({ length: slots.length }, (_, i) => assignments[i] ?? null);
    setAssignments(a);
    setResult(resolveRound(ally, enemy, a, (die) => parseRoll(die.roll, die.effect)));
  }

  function setMatchup(slot: number, targetId: string) {
    setAssignments((p) => {
      const n: (Matchup | null)[] = Array.from({ length: slots.length }, (_, i) => p[i] ?? null);
      n[slot] = targetId
        ? { attackerId: slots[slot].unit.id, duelIndex: slots[slot].duelIndex, defenderId: targetId }
        : null;
      return n;
    });
    setResult(null);
  }

  function applyRound() {
    if (!result) return;
    setVitals((prev) => {
      const next = { ...prev };
      for (const u of board) {
        next[u.id] = { hp: prev[u.id]?.hp ?? u.persona.hp, san: prev[u.id]?.san ?? u.persona.san };
      }
      for (const d of result.duels) {
        if (d.winner === "attacker") {
          next[d.matchup.defenderId] = {
            hp: Math.max(0, (next[d.matchup.defenderId]?.hp ?? 0) - d.attackDamage),
            san: Math.max(0, (next[d.matchup.defenderId]?.san ?? 0) - d.sanDamage),
          };
        } else if (d.winner === "defender") {
          next[d.matchup.attackerId] = {
            ...next[d.matchup.attackerId],
            hp: Math.max(0, (next[d.matchup.attackerId]?.hp ?? 0) - d.defensiveDamage),
          };
        }
      }
      return next;
    });
  }

  return (
    <main>
      <h1>LBT戦闘シミュレーター</h1>

      <section className="panel">
        <h2>データ読み込み</h2>
        <label>
          LBT db.json URL{" "}
          <input style={{ width: 420 }} value={dbUrl} onChange={(e) => setDbUrl(e.target.value)} placeholder="…/data/db.json (raw URL)" />
        </label>{" "}
        <button className="primary" onClick={loadDbFromUrl}>取得</button>
        <p className="meta">またはローカルJSON読み込み: normal=公式 / tokui=同期</p>
        <input type="file" accept=".json" onChange={onImport} aria-label="ローカルdb.json読み込み" />
        {error && <p className="error-text" role="alert">{error}</p>}
        {all.length > 0 && (
          <p className="meta">読み込み済み人格: {all.length}件(公式{official.length}/同期{sync.length})</p>
        )}
      </section>

      <section className="side-grid">
        {(["ally", "enemy"] as Side[]).map((side) => (
          <div className="panel" key={side}>
            <h2>{side === "ally" ? "味方" : "敵"}</h2>
            <button className="primary" onClick={() => setPicking(side)}>+ 人格選択</button>
            {(side === "ally" ? ally : enemy).map((u) => {
              const p = u.persona;
              const v = vitals[u.id];
              return (
                <div className="unit-row" key={u.id}>
                  <div className="info">
                    <div className="name">{p.name}</div>
                    <div className="meta">HP {v ? `${v.hp}/${p.hp}` : p.hp} / SAN {v ? `${v.san}/${p.san}` : p.san} / 速度 {p.speed}</div>
                    <div className="res">
                      {resBadge(`斬${p.res_slash}`)}{resBadge(`貫${p.res_pierce}`)}{resBadge(`打${p.res_blunt}`)}
                    </div>
                    <div>
                      {p.skills.map((s, i) => (
                        <span key={i} className={`dice-chip ${s.type.startsWith("斬") ? "slash" : s.type.startsWith("貫") ? "pierce" : "blunt"}`}>
                          {s.name} {s.dice.map((d) => d.roll).join(" / ")}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    className="remove"
                    aria-label={`${p.name}を削除`}
                    onClick={() => {
                      side === "ally" ? setAlly((prev) => prev.filter((x) => x.id !== u.id)) : setEnemy((prev) => prev.filter((x) => x.id !== u.id));
                      setAssignments([]); setResult(null);
                    }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </section>

      <section className="panel">
        <h2>ターゲット設定</h2>
        <ol>
          {slots.map((s, i) => (
            <li key={`${s.unit.id}-${s.duelIndex}`}>
              <span className={`dice-chip ${s.atk}`}>{s.label}</span> →{" "}
              <select
                aria-label={`ダイス${i + 1}のターゲット`}
                value={assignments[i]?.defenderId ?? ""}
                onChange={(e) => setMatchup(i, e.target.value)}
              >
                <option value="">対象なし(攻撃のみ)</option>
                {board.map((t) => (
                  <option key={t.id} value={t.id}>{t.persona.name}</option>
                ))}
              </select>
            </li>
          ))}
        </ol>
        <button className="primary" onClick={resolve} disabled={board.length < 2 || !slots.length}>盤面を整理</button>{" "}
        <button onClick={applyRound} disabled={!result}>結果をHP/SANへ反映</button>{" "}
        <button onClick={() => { setAlly([]); setEnemy([]); setAssignments([]); setResult(null); setVitals({}); }}>リセット</button>
      </section>

      {result && (
        <section className="panel">
          <h2>マッチ判定</h2>
          <p className="meta">攻撃成立 {result.duels.filter((d) => d.winner === "attacker").length} / 全 {result.duels.length}</p>
          <h3>行動順</h3>
          <ol>
            {result.order.map((m, i) => {
              const s = m && slots.find((x) => x.unit.id === m.attackerId && x.duelIndex === m.duelIndex);
              return <li key={i}>{s ? s.label : "(未設定)"}</li>;
            })}
          </ol>
          <h3>デュエル結果</h3>
          {result.duels.map((d, i) => (
            <div key={i} className={`result-item ${d.winner}`}>
              {d.attackerName}[{d.attackerRoll}={d.attackerTotal}] vs {d.defenderName}[{d.defenderRoll}={d.defenderTotal}] →{" "}
              {d.winner === "tie" ? "相殺(同値)" : d.winner === "attacker"
                ? `${d.attackerName}の攻撃成立: HP−${d.attackDamage} / SAN−${d.sanDamage}`
                : `${d.defenderName}が勝利: 反撃 HP−${d.defensiveDamage}`}
            </div>
          ))}
        </section>
      )}

      {board.length > 0 && (
        <section className="panel">
          <h2>現在のHP / SAN</h2>
          <div className="vitals">
            {board.filter((u) => vitals[u.id]).map((u) => {
              const v = vitals[u.id];
              return (
                <div className="vital" key={u.id}>
                  <span>{u.persona.name}</span>
                  <div className="bar hp"><span style={{ width: `${(v.hp / u.persona.hp) * 100}%` }} /></div>
                  <span className="meta">{v.hp}/{u.persona.hp}</span>
                  <span>SAN</span>
                  <div className="bar san"><span style={{ width: `${(v.san / u.persona.san) * 100}%` }} /></div>
                  <span className="meta">{v.san}/{u.persona.san}</span>
                </div>
              );
            })}
            {!board.some((u) => vitals[u.id]) && <p className="meta">未反映(盤面整理→結果を反映で更新)</p>}
          </div>
        </section>
      )}

      {picking && (
        <PersonaPicker
          source={affiliation ? all.filter((u) => u.persona.affiliation === affiliation) : all}
          affiliations={affiliations}
          affiliation={affiliation}
          onAffiliation={setAffiliation}
          onClose={() => setPicking(null)}
          onPick={(p) => addPersona(picking, p)}
        />
      )}
    </main>
  );
}

function PersonaPicker(props: {
  source: LbtUnit[];
  affiliations: string[];
  affiliation: string;
  onAffiliation: (a: string) => void;
  onClose: () => void;
  onPick: (p: Persona) => void;
}) {
  const [q, setQ] = useState("");
  const list = props.source.filter((u) => u.persona.name.includes(q)).slice(0, 200);
  return (
    <div className="modal-backdrop" onClick={props.onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="人格選択"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <input
            autoFocus
            placeholder="人格名検索"
            aria-label="人格名検索"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ flex: 1 }}
          />
          <select aria-label="所属で絞り込み" value={props.affiliation} onChange={(e) => props.onAffiliation(e.target.value)}>
            <option value="">所属: 全て</option>
            {props.affiliations.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <button onClick={props.onClose}>閉じる</button>
        </div>
        <div className="picker-list">
          {list.map((u) => {
            const p = u.persona;
            return (
              <button className="picker-item" key={u.id} onClick={() => props.onPick(p)}>
                <span className="pname">{p.name}</span>
                <span className="pmeta">No.{p.no} HP{p.hp} SAN{p.san} 速度{p.speed}</span>
                <span className="res">{resBadge(p.res_slash)}{resBadge(p.res_pierce)}{resBadge(p.res_blunt)}</span>
              </button>
            );
          })}
          {!list.length && <p className="meta">該当なし</p>}
        </div>
      </div>
    </div>
  );
}

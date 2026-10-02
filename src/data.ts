import type { LbtUnit, Persona } from "./types";

// LIMBUS_BUILD_TERMINAL db.json adapter (official: normal_personas / sync: tokui_personas)
export interface LbtDb {
  normal_personas: Persona[];
  tokui_personas: Persona[];
  [k: string]: unknown;
}

export function parseDb(jsonText: string): LbtDb {
  return JSON.parse(jsonText) as LbtDb;
}

function toUnit(p: Persona, source: LbtUnit["source"]): LbtUnit {
  return {
    id: `${source}-${p.no}-${p.name}`,
    source,
    persona: p,
  };
}

export function unitsFromDb(db: LbtUnit | LbtDb | unknown): { official: LbtUnit[]; sync: LbtUnit[] } {
  const d = db as LbtDb;
  return {
    official: (d.normal_personas ?? []).map((p) => toUnit(p, "official")),
    sync: (d.tokui_personas ?? []).map((p) => toUnit(p, "sync")),
  };
}

// official/derived enemy generation from any persona
export function generateEnemy(src: LbtUnit): LbtUnit {
  return {
    id: `enemy-${src.persona.no}-${src.persona.name}-${Math.random().toString(36).slice(2, 6)}`,
    source: "enemy",
    persona: src.persona,
  };
}

const SYNC_KEY = "lbt-sim-sync-units";
export function loadSyncUnits(): LbtUnit[] {
  try {
    const s = localStorage.getItem(SYNC_KEY);
    return s ? (JSON.parse(s) as LbtUnit[]) : [];
  } catch {
    return [];
  }
}
export function saveSyncUnits(units: LbtUnit[]): void {
  localStorage.setItem(SYNC_KEY, JSON.stringify(units));
}
export function addSyncUnit(u: LbtUnit): LbtUnit[] {
  const next = [...loadSyncUnits().filter((x) => x.id !== u.id), u];
  saveSyncUnits(next);
  return next;
}
export function removeSyncUnit(id: string): LbtUnit[] {
  const next = loadSyncUnits().filter((x) => x.id !== id);
  saveSyncUnits(next);
  return next;
}

export function importSyncFile(file: File): Promise<LbtUnit[]> {
  return file.text().then((t) => {
    const db = parseDb(t);
    if (db.tokui_personas) return unitsFromDb(db).sync;
    const p = JSON.parse(t) as Persona;
    return [toUnit(p, "sync")];
  });
}

// remote (public repo raw URL)
export async function fetchOfficialDb(url: string): Promise<LbtDb> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${url}`);
  return parseDb(await res.text());
}

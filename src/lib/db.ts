"use client";

import Dexie, { type EntityTable } from "dexie";
import type { BoardState, Me, SessionInfo, Tweaks } from "./types";

interface SessionRecord {
  id: string;
  session: SessionInfo;
  board: BoardState;
  updatedAt: number;
}

interface PrefsRecord {
  id: string;
  me?: Me;
  tweaks?: Tweaks;
  lastSessionId?: string;
  guestMeByCode?: Record<string, Me>;
}

class RRRetroDB extends Dexie {
  sessions!: EntityTable<SessionRecord, "id">;
  prefs!: EntityTable<PrefsRecord, "id">;

  constructor() {
    super("rrretro");
    this.version(1).stores({
      sessions: "id, updatedAt",
      prefs: "id",
    });
  }
}

let _db: RRRetroDB | null = null;
export function db(): RRRetroDB {
  if (!_db) _db = new RRRetroDB();
  return _db;
}

export async function saveSession(rec: { session: SessionInfo; board: BoardState }) {
  await db().sessions.put({
    id: rec.session.id,
    session: rec.session,
    board: rec.board,
    updatedAt: Date.now(),
  });
  await setPref({ lastSessionId: rec.session.id });
}

export async function loadSession(id: string): Promise<SessionRecord | undefined> {
  return db().sessions.get(id);
}

export async function deleteSession(id: string) {
  await db().sessions.delete(id);
}

export async function loadLastSession(): Promise<SessionRecord | undefined> {
  const p = await db().prefs.get("me");
  if (!p?.lastSessionId) return undefined;
  return db().sessions.get(p.lastSessionId);
}

export async function getPrefs(): Promise<PrefsRecord | undefined> {
  return db().prefs.get("me");
}

export async function setPref(patch: Partial<PrefsRecord>) {
  const existing = (await db().prefs.get("me")) ?? { id: "me" };
  await db().prefs.put({ ...existing, ...patch, id: "me" });
}

export async function saveGuestMe(code: string, me: Me) {
  const existing = (await db().prefs.get("me")) ?? { id: "me" };
  const map = { ...(existing.guestMeByCode ?? {}), [code]: me };
  await db().prefs.put({ ...existing, guestMeByCode: map, id: "me" });
}

export async function loadGuestMe(code: string): Promise<Me | undefined> {
  const p = await db().prefs.get("me");
  return p?.guestMeByCode?.[code];
}

export async function resetAll() {
  await Promise.all([db().sessions.clear(), db().prefs.clear()]);
}

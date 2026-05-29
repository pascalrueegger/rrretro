"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { normalizeBoard, seedBoard } from "@/lib/board";
import { applyTheme, nameColor } from "@/lib/theme";
import {
  deleteSession,
  getPrefs,
  loadGuestMe,
  loadSession,
  saveGuestMe,
  saveSession,
  setPref,
} from "@/lib/db";
import { initials, makeJoinToken, randCode, uid } from "@/lib/util";
import type { BoardState, Me, SessionInfo, Tweaks } from "@/lib/types";

const DEFAULT_TWEAKS: Tweaks = { theme: "light", density: "regular", flavor: "swiss" };

export type Mode = "loading" | "host-setup" | "join" | "board";

export interface UseSessionOptions {
  // Called before the session-side reset inside onNewBoard so callers can
  // tear down peer connections, clear UI flags, and zero out participants.
  onResetExternal?: () => void;
  // Called when the host identity is established (host-setup or restore-from-db),
  // so the caller can seed `participants` with the host's own entry.
  onHostEstablished?: (me: Me) => void;
}

export interface UseSessionResult {
  mode: Mode;
  setMode: Dispatch<SetStateAction<Mode>>;
  me: Me | null;
  setMe: Dispatch<SetStateAction<Me | null>>;
  session: SessionInfo | null;
  setSession: Dispatch<SetStateAction<SessionInfo | null>>;
  board: BoardState | null;
  setBoard: Dispatch<SetStateAction<BoardState | null>>;
  tweaks: Tweaks;
  setTweaks: Dispatch<SetStateAction<Tweaks>>;
  joinCode: string | null;
  joinToken: string | null;
  onHostSetup: (args: { name: string; title: string }) => void;
  onJoin: (args: { name: string }) => void;
  onNewBoard: () => Promise<void>;
}

export function useSession(opts: UseSessionOptions = {}): UseSessionResult {
  const { onResetExternal, onHostEstablished } = opts;

  const [mode, setMode] = useState<Mode>("loading");
  const [tweaks, setTweaks] = useState<Tweaks>(DEFAULT_TWEAKS);
  const [me, setMe] = useState<Me | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [board, setBoard] = useState<BoardState | null>(null);

  const joinCode = useMemo(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(location.search).get("join");
  }, []);
  const joinToken = useMemo(() => {
    if (typeof window === "undefined") return null;
    const hash = location.hash.replace(/^#/, "");
    return new URLSearchParams(hash).get("k");
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await getPrefs();
      if (cancelled) return;
      if (p?.tweaks) setTweaks(p.tweaks);
      if (joinCode) {
        const guestMe = await loadGuestMe(joinCode);
        if (cancelled) return;
        const sess: SessionInfo = {
          id: `s_${joinCode}`,
          title: "Sprint Retrospective",
          code: joinCode,
          hostName: "Host",
          sharing: true,
          createdAt: Date.now(),
        };
        setSession(sess);
        if (guestMe) {
          setMe(guestMe);
          setMode("board");
        } else {
          setMode("join");
        }
      } else if (p?.lastSessionId) {
        const rec = await loadSession(p.lastSessionId);
        if (rec && p.me) {
          const restored = rec.session.joinToken
            ? rec.session
            : { ...rec.session, joinToken: makeJoinToken() };
          setMe(p.me);
          setSession(restored);
          setBoard(normalizeBoard(rec.board));
          if (p.me.isHost) {
            onHostEstablished?.(p.me);
          }
          setMode("board");
          return;
        }
        setMode("host-setup");
      } else {
        setMode("host-setup");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [joinCode, onHostEstablished]);

  useEffect(() => {
    applyTheme(tweaks.theme, tweaks.flavor, tweaks.density);
  }, [tweaks.theme, tweaks.flavor, tweaks.density]);

  useEffect(() => {
    setPref({ tweaks });
  }, [tweaks]);

  useEffect(() => {
    if (me?.isHost) setPref({ me });
  }, [me]);

  useEffect(() => {
    if (mode !== "board" || !session || !board) return;
    const t = setTimeout(() => {
      saveSession({ session, board }).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [mode, session, board]);

  const onHostSetup = useCallback(
    ({ name, title }: { name: string; title: string }) => {
      const color = nameColor(name);
      const newMe: Me = { id: uid("u"), name, color, initial: initials(name), isHost: true };
      const code = randCode();
      const newSession: SessionInfo = {
        id: `s_${code}`,
        title,
        code,
        hostName: name,
        sharing: true,
        createdAt: Date.now(),
        joinToken: makeJoinToken(),
      };
      setMe(newMe);
      setSession(newSession);
      setBoard(seedBoard());
      onHostEstablished?.(newMe);
      setMode("board");
    },
    [onHostEstablished],
  );

  const onJoin = useCallback(
    ({ name }: { name: string }) => {
      const color = nameColor(name);
      const newMe: Me = { id: uid("u"), name, color, initial: initials(name), isHost: false };
      setMe(newMe);
      setMode("board");
      if (joinCode) saveGuestMe(joinCode, newMe).catch(() => {});
    },
    [joinCode],
  );

  const onNewBoard = useCallback(async () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Start a new board? This will discard the current retro.")
    ) {
      return;
    }
    try {
      if (session?.id) await deleteSession(session.id);
      await setPref({ lastSessionId: undefined });
    } catch {}
    onResetExternal?.();
    setBoard(null);
    setSession(null);
    setMe(null);
    setMode("host-setup");
  }, [session, onResetExternal]);

  return {
    mode,
    setMode,
    me,
    setMe,
    session,
    setSession,
    board,
    setBoard,
    tweaks,
    setTweaks,
    joinCode,
    joinToken,
    onHostSetup,
    onJoin,
    onNewBoard,
  };
}

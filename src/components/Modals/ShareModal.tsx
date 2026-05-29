"use client";

import { Fragment, useRef, useState } from "react";
import type { Participant, SessionInfo } from "@/lib/types";
import { copyText } from "@/lib/clipboard";

export function ShareModal({
  session, host, participants, sharing, onToggleSharing, onClose,
}: {
  session: SessionInfo;
  host: { name: string; color: string; initial: string };
  participants: Participant[];
  sharing: boolean;
  onToggleSharing: () => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  // Token rides the URL fragment so it never reaches the server / referer.
  const tokenFrag = session.joinToken ? `#k=${session.joinToken}` : "";
  const link =
    typeof window !== "undefined"
      ? `${location.origin}${location.pathname}?join=${session.code}${tokenFrag}`
      : `?join=${session.code}${tokenFrag}`;
  const inputRef = useRef<HTMLInputElement>(null);

  const copy = async () => {
    if (!sharing) return;
    const ok = await copyText(link);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } else {
      inputRef.current?.select();
    }
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Share this retro</h2>
        <p className="sub">Send this link to your team. They&apos;ll enter their name and join the board.</p>

        <div className={`share-link ${!sharing ? "is-off" : ""}`}>
          <input ref={inputRef} className="input" value={link} readOnly
                 disabled={!sharing}
                 onFocus={(e) => sharing && e.currentTarget.select()} />
          <button type="button" className="btn" onClick={copy} disabled={!sharing}>
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>

        <div className="share-toggle">
          <div className="share-toggle-text">
            <div className="share-toggle-label">
              {sharing ? "Sharing is on" : "Sharing is paused"}
            </div>
            <div className="share-toggle-sub">
              {sharing
                ? "Anyone with the link can join the board."
                : "The link is disabled. Nobody new can join."}
            </div>
          </div>
          <button type="button"
                  className={`switch ${sharing ? "on" : "off"}`}
                  role="switch"
                  aria-checked={sharing}
                  onClick={onToggleSharing}>
            <span className="switch-knob" />
          </button>
        </div>

        <div className="share-presence">
          <span>In the room</span>
          <span className="avatar" style={{ background: host.color }}>{host.initial}</span>
          <span className="muted" style={{ fontSize: 12 }}>
            {host.name} <span style={{ opacity: 0.6 }}>(host)</span>
          </span>
          {participants.map((p) => (
            <Fragment key={p.id}>
              <span className="avatar" style={{ background: p.color }}>{p.initial}</span>
              <span className="muted" style={{ fontSize: 12 }}>{p.name}</span>
            </Fragment>
          ))}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

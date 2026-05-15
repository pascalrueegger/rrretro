"use client";

import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
import type { Card as CardT, Me, Participant, SessionInfo } from "@/lib/types";
import { copyRich, copyText } from "@/lib/clipboard";

export function HostSetupModal({ onSubmit }: { onSubmit: (v: { name: string; title: string }) => void }) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("Sprint 24 Retrospective");
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { nameRef.current?.focus(); }, []);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const n = name.trim();
    const t = title.trim();
    if (!n || !t) return;
    onSubmit({ name: n, title: t });
  };

  return (
    <div className="scrim">
      <form className="modal" onSubmit={submit}>
        <h2>Start a retro</h2>
        <p className="sub">You&apos;ll host this session. Give it a title and share a join link with your team — they only need to enter their name.</p>
        <div className="field">
          <label htmlFor="hn">Your name</label>
          <input ref={nameRef} id="hn" className="input" value={name}
                 placeholder="e.g. Maya Okafor"
                 onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ht">Session title</label>
          <input id="ht" className="input" value={title}
                 onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="modal-foot">
          <button type="submit" className="btn btn-primary"
                  disabled={!name.trim() || !title.trim()}>
            Open board →
          </button>
        </div>
      </form>
    </div>
  );
}

export function JoinModal({
  sessionTitle, hostName, onSubmit,
}: { sessionTitle: string; hostName: string; onSubmit: (v: { name: string }) => void }) {
  const [name, setName] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { nameRef.current?.focus(); }, []);
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) return;
    onSubmit({ name: name.trim() });
  };
  return (
    <div className="scrim">
      <form className="modal" onSubmit={submit}>
        <h2>Join &ldquo;{sessionTitle}&rdquo;</h2>
        <p className="sub">Hosted by {hostName}. Just enter your name to join the board.</p>
        <div className="field">
          <label htmlFor="jn">Your name</label>
          <input ref={nameRef} id="jn" className="input" value={name}
                 placeholder="e.g. Sam Iyengar"
                 onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="modal-foot">
          <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
            Join board →
          </button>
        </div>
      </form>
    </div>
  );
}

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
  const link =
    typeof window !== "undefined"
      ? `${location.origin}${location.pathname}?join=${session.code}`
      : `?join=${session.code}`;
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

export function ExportModal({
  markdown, markdownHtml, actionsChat, actionsHtml, sessionTitle, hasActions, onClose,
}: {
  markdown: string;
  markdownHtml: string;
  actionsChat: string;
  actionsHtml: string;
  sessionTitle: string;
  hasActions: number;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"full" | "actions">("full");
  const [copied, setCopied] = useState(false);
  const body = mode === "full" ? markdown : actionsChat;
  const html = mode === "full" ? markdownHtml : actionsHtml;

  const copy = async () => {
    const ok = html ? await copyRich(body, html) : await copyText(body);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }
  };
  const download = () => {
    const ext = mode === "full" ? "md" : "txt";
    const mime = mode === "full" ? "text/markdown" : "text/plain";
    const suffix = mode === "full" ? "" : "-actions";
    const blob = new Blob([body], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sessionTitle.replace(/[^\w-]+/g, "-").toLowerCase()}${suffix}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" style={{ width: "min(640px, 92vw)" }} onClick={(e) => e.stopPropagation()}>
        <h2>Export retro</h2>
        <p className="sub" style={{ marginBottom: 14 }}>
          {mode === "full"
            ? "Markdown — ready to drop into your wiki, doc, or PR description."
            : "A short summary of the action items, formatted for pasting into Slack or Teams."}
        </p>

        <div className="export-tabs">
          <button type="button"
                  className={mode === "full" ? "active" : ""}
                  onClick={() => setMode("full")}>
            Full retro
          </button>
          <button type="button"
                  className={mode === "actions" ? "active" : ""}
                  onClick={() => setMode("actions")}>
            Actions only
            <span className="tab-count">{hasActions}</span>
          </button>
        </div>

        <div className="export-box">{body}</div>

        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Close</button>
          <button type="button" className="btn" onClick={copy}>{copied ? "✓ Copied" : "Copy"}</button>
          <button type="button" className="btn btn-primary" onClick={download}>
            Download .{mode === "full" ? "md" : "txt"}
          </button>
        </div>
      </div>
    </div>
  );
}

const END_MESSAGES = [
  "Your host has left you. Sad times.",
  "Retro over. Why do all good things come to an end?",
  "That's it, retro over. You did it. Well done!",
  "Mission complete. Retrospective is officially over.",
  "Retro finished. Now time for coffee!",
];

const HINTS = [
  "",
  "This button won't do anything, you're disconnected!",
  "You really like clicking buttons, right?",
  "Ok, waiting for host to resume session…",
];
const hintsCount = HINTS.length -1;

export function SessionEndedModal() {
  const [msg] = useState(() => END_MESSAGES[Math.floor(Math.random() * END_MESSAGES.length)]);
  const [stage, setStage] = useState(0);
  
  return (
    <div className="scrim">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Session ended</h2>
        <p className="sub" style={{ marginBottom: 0 }}>{msg}</p>
        <div className="modal-foot" style={{ alignItems: "center" }}>
          <span className="hint" style={{ flex: 1, marginTop: 0 }}>
            {HINTS[stage]}
          </span>
          <button type="button" className="btn btn-primary"
                  disabled={stage >= hintsCount}
                  onClick={() => setStage((s) => Math.min(s + 1, hintsCount))}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

export function ActionComposeModal({
  parentCard, onCancel, onCreate,
}: {
  parentCard: CardT;
  me: Me;
  onCancel: () => void;
  onCreate: (v: { text: string; assignee: string | null; dueDate: string | null }) => void;
}) {
  const [text, setText] = useState("");
  const [assignee, setAssignee] = useState("");
  const [dueDate, setDueDate] = useState("");
  const textRef = useRef<HTMLTextAreaElement>(null);

  const autoSize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 280) + "px";
  };

  useEffect(() => {
    if (textRef.current) {
      textRef.current.focus();
      autoSize(textRef.current);
    }
  }, []);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const t = text.trim();
    if (!t) return;
    onCreate({ text: t, assignee: assignee.trim() || null, dueDate: dueDate || null });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        submit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const parentSnippet = (parentCard?.text || "").slice(0, 120);
  return (
    <div className="scrim" onClick={onCancel}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="action-modal-context">
          <span className="action-pill">↳ action</span>
          <span className="muted" style={{ fontSize: 12 }}>from</span>
        </div>
        <blockquote className="action-modal-parent">{parentSnippet || "(empty card)"}</blockquote>

        <div className="field" style={{ marginTop: 18 }}>
          <label htmlFor="ac-t">Action</label>
          <textarea ref={textRef} id="ac-t" className="input"
                    rows={2}
                    placeholder="What needs to happen?"
                    value={text}
                    onChange={(e) => { setText(e.target.value); autoSize(e.currentTarget); }}
                    style={{ resize: "none", overflow: "hidden", minHeight: 48, fontFamily: "inherit" }} />
        </div>

        <div className="field-row">
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label htmlFor="ac-a">Assignee</label>
            <input id="ac-a" className="input"
                   placeholder="Who's on it?"
                   value={assignee}
                   onChange={(e) => setAssignee(e.target.value)} />
          </div>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label htmlFor="ac-d">Due date</label>
            <input id="ac-d" type="date" className="input"
                   value={dueDate}
                   onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>

        <div className="hint" style={{ marginTop: 10 }}>
          <span className="kbd">⌘↵</span> create · <span className="kbd">esc</span> cancel
        </div>

        <div className="modal-foot">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!text.trim()}>
            Create action →
          </button>
        </div>
      </form>
    </div>
  );
}

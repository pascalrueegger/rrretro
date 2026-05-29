"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

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

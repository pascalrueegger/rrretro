"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

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

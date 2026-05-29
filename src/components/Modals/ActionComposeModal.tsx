"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Card as CardT, Me } from "@/lib/types";

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

"use client";

import { useState } from "react";
import { copyRich, copyText } from "@/lib/clipboard";

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

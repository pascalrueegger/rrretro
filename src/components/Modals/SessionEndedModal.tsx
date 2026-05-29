"use client";

import { useState } from "react";

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
const hintsCount = HINTS.length - 1;

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

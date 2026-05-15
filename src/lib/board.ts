import type { BoardState, Column } from "./types";

export const DEFAULT_COLUMNS: Column[] = [
  { id: "col_w", title: "Went well" },
  { id: "col_d", title: "Didn't go well" },
  { id: "col_q", title: "Open questions?" },
];

export function seedBoard(): BoardState {
  return {
    columns: DEFAULT_COLUMNS.map((c) => ({ ...c })),
    layout: Object.fromEntries(DEFAULT_COLUMNS.map((c) => [c.id, []])),
    cards: {},
    groups: {},
    actions: [],
  };
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function buildActionsHtml(board: BoardState, sessionTitle: string) {
  if (!board.actions.length) {
    return `<p><em>No actions captured for &ldquo;${esc(sessionTitle)}&rdquo; yet.</em></p>`;
  }
  const parts: string[] = [];
  parts.push(
    `<p><strong>${esc(sessionTitle)} &mdash; Actions</strong> (${board.actions.length})</p>`
  );
  parts.push("<ul>");
  for (const id of board.actions) {
    const c = board.cards[id];
    if (!c) continue;
    const meta: string[] = [];
    if (c.assignee) meta.push(`@${c.assignee}`);
    if (c.dueDate) {
      const d = new Date(c.dueDate + "T00:00:00");
      if (!Number.isNaN(d.getTime())) {
        meta.push(
          `due ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
        );
      } else {
        meta.push(`due ${c.dueDate}`);
      }
    }
    const tail = meta.length
      ? ` &nbsp;<em>(${esc(meta.join(" · "))})</em>`
      : "";
    parts.push(`<li>${esc(c.text)}${tail}</li>`);
  }
  parts.push("</ul>");
  parts.push(
    `<p><em>From the retro on ${esc(new Date().toLocaleDateString())}</em></p>`
  );
  return parts.join("");
}

export function buildMarkdownHtml(board: BoardState, sessionTitle: string, hostName: string) {
  const parts: string[] = [];
  parts.push(`<h1>${esc(sessionTitle)}</h1>`);
  parts.push(
    `<p><em>Hosted by ${esc(hostName)} &middot; ${esc(new Date().toLocaleDateString())}</em></p>`
  );
  for (const col of board.columns) {
    parts.push(`<h2>${esc(col.title)}</h2>`);
    const items = board.layout[col.id] || [];
    if (!items.length) {
      parts.push("<p><em>(empty)</em></p>");
      continue;
    }
    parts.push("<ul>");
    for (const it of items) {
      if (it.type === "group") {
        const g = board.groups[it.id];
        if (!g) continue;
        parts.push(`<li><strong>${esc(g.label)}</strong><ul>`);
        for (const cid of g.cardIds) {
          const c = board.cards[cid];
          if (!c) continue;
          parts.push(renderCardHtml(c));
        }
        parts.push("</ul></li>");
      } else {
        const c = board.cards[it.id];
        if (!c) continue;
        parts.push(renderCardHtml(c));
      }
    }
    parts.push("</ul>");
  }
  if (board.actions.length) {
    parts.push("<h2>Actions</h2>");
    parts.push("<ul>");
    for (const id of board.actions) {
      const c = board.cards[id];
      if (!c) continue;
      const parent = c.parentCardId && board.cards[c.parentCardId];
      const meta: string[] = [];
      if (c.assignee) meta.push(`@${c.assignee}`);
      if (c.dueDate) meta.push(`due ${c.dueDate}`);
      const metaTail = meta.length ? ` &mdash; ${esc(meta.join(" · "))}` : "";
      const ctx = parent
        ? ` <em>(from: &ldquo;${esc((parent.text || "").slice(0, 60))}&rdquo;)</em>`
        : "";
      parts.push(
        `<li>${esc(c.text)}${metaTail} &mdash; <em>${esc(c.author)}</em>${ctx}</li>`
      );
    }
    parts.push("</ul>");
  }
  return parts.join("");
}

function renderCardHtml(c: BoardState["cards"][string]) {
  const rxn: string[] = [];
  if (c.reactions.up?.length) rxn.push(`+1 ${c.reactions.up.length}`);
  if (c.reactions.celebrate?.length) rxn.push(`🎉 ${c.reactions.celebrate.length}`);
  if (c.reactions.gratitude?.length) rxn.push(`♡ ${c.reactions.gratitude.length}`);
  const tail = rxn.length ? ` <em>(${esc(rxn.join(" · "))})</em>` : "";
  let inner = `${esc(c.text)} &mdash; <em>${esc(c.author)}</em>${tail}`;
  if (c.comments.length) {
    inner += "<ul>";
    for (const cm of c.comments) {
      inner += `<li><em>${esc(cm.author)}</em>: ${esc(cm.text)}</li>`;
    }
    inner += "</ul>";
  }
  return `<li>${inner}</li>`;
}

export function buildActionsChat(board: BoardState, sessionTitle: string) {
  if (!board.actions.length) {
    return `_No actions captured for "${sessionTitle}" yet._`;
  }
  const lines: string[] = [];
  lines.push(`*${sessionTitle} — Actions* (${board.actions.length})`);
  lines.push("");
  for (const id of board.actions) {
    const c = board.cards[id];
    if (!c) continue;
    const meta: string[] = [];
    if (c.assignee) meta.push(`@${c.assignee}`);
    if (c.dueDate) {
      const d = new Date(c.dueDate + "T00:00:00");
      if (!Number.isNaN(d.getTime())) {
        meta.push(`due ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`);
      } else {
        meta.push(`due ${c.dueDate}`);
      }
    }
    const tail = meta.length ? `  _(${meta.join(" · ")})_` : "";
    lines.push(`• ${c.text}${tail}`);
  }
  lines.push("");
  lines.push(`_From the retro on ${new Date().toLocaleDateString()}_`);
  return lines.join("\n");
}

export function buildMarkdown(board: BoardState, sessionTitle: string, hostName: string) {
  const lines: string[] = [];
  lines.push(`# ${sessionTitle}`);
  lines.push("");
  lines.push(`_Hosted by ${hostName} · ${new Date().toLocaleDateString()}_`);
  lines.push("");
  for (const col of board.columns) {
    lines.push(`## ${col.title}`);
    lines.push("");
    const items = board.layout[col.id] || [];
    if (items.length === 0) {
      lines.push("_(empty)_");
      lines.push("");
      continue;
    }
    for (const it of items) {
      if (it.type === "group") {
        const g = board.groups[it.id];
        if (!g) continue;
        lines.push(`**${g.label}**`);
        for (const cid of g.cardIds) {
          const c = board.cards[cid];
          if (!c) continue;
          renderCardMd(c, lines, "  ");
        }
        lines.push("");
      } else {
        const c = board.cards[it.id];
        if (!c) continue;
        renderCardMd(c, lines, "");
      }
    }
  }
  if (board.actions.length) {
    lines.push(`## Actions`);
    lines.push("");
    for (const id of board.actions) {
      const c = board.cards[id];
      if (!c) continue;
      const parent = c.parentCardId && board.cards[c.parentCardId];
      const meta: string[] = [];
      if (c.assignee) meta.push(`@${c.assignee}`);
      if (c.dueDate) meta.push(`due ${c.dueDate}`);
      const metaTail = meta.length ? ` — ${meta.join(" · ")}` : "";
      const ctx = parent ? ` _(from: "${(parent.text || "").slice(0, 60)}")_` : "";
      lines.push(`- [ ] ${c.text}${metaTail} — _${c.author}_${ctx}`);
    }
  }
  return lines.join("\n");
}

function renderCardMd(
  c: BoardState["cards"][string],
  lines: string[],
  indent: string
) {
  const rxn: string[] = [];
  if ((c.reactions.up || []).length) rxn.push(`+1 ${c.reactions.up.length}`);
  if ((c.reactions.celebrate || []).length) rxn.push(`🎉 ${c.reactions.celebrate.length}`);
  if ((c.reactions.gratitude || []).length) rxn.push(`♡ ${c.reactions.gratitude.length}`);
  const tail = rxn.length ? ` _(${rxn.join(" · ")})_` : "";
  lines.push(`${indent}- ${c.text} — _${c.author}_${tail}`);
  for (const cm of c.comments) {
    lines.push(`${indent}  - _${cm.author}_: ${cm.text}`);
  }
}

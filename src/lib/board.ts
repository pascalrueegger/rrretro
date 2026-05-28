import type { BoardState, Card, Column, LayoutItem, ReactionKey, ReactionVote, Reactions } from "./types";

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

/**
 * Migrate legacy shapes:
 * - Reactions stored as `string[]` of names → `ReactionVote[]` with synthetic ids.
 * - Cards/Comments missing `authorId` → derive from author name (best effort).
 * Idempotent; safe to call on already-normalized boards.
 */
export function normalizeBoard(b: BoardState): BoardState {
  const KEYS: ReactionKey[] = ["up", "celebrate", "gratitude"];
  const normRx = (r: unknown): Reactions => {
    const src = (r ?? {}) as Record<string, unknown>;
    const out = { up: [], celebrate: [], gratitude: [] } as Reactions;
    for (const k of KEYS) {
      const arr = src[k];
      if (!Array.isArray(arr)) continue;
      out[k] = arr.map((v): ReactionVote => {
        if (typeof v === "string") return { id: `legacy:${v}`, name: v };
        const o = v as Partial<ReactionVote>;
        return { id: o.id ?? `legacy:${o.name ?? "?"}`, name: o.name ?? "?" };
      });
    }
    return out;
  };
  const normCard = (c: Card): Card => ({
    ...c,
    authorId: c.authorId ?? `legacy:${c.author}`,
    reactions: normRx(c.reactions),
    comments: (c.comments || []).map((cm) => ({
      ...cm,
      authorId: cm.authorId ?? `legacy:${cm.author}`,
    })),
  });
  const cards: Record<string, Card> = {};
  for (const id of Object.keys(b.cards || {})) cards[id] = normCard(b.cards[id]);
  return { ...b, cards };
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

/* ─── Pure board reducers ─────────────────────────────────────────── */

export interface Identity {
  id: string;
  name: string;
  color: string;
}

export interface AddCardArgs {
  id: string;
  columnId: string;
  text: string;
  author: Identity;
}
export function applyAddCard(b: BoardState, args: AddCardArgs): BoardState {
  const { id, columnId, text, author } = args;
  return {
    ...b,
    cards: {
      ...b.cards,
      [id]: {
        id,
        columnId,
        text,
        author: author.name,
        authorId: author.id,
        authorColor: author.color,
        comments: [],
        reactions: { up: [], celebrate: [], gratitude: [] },
        parentCardId: null,
        actionCardIds: [],
        isAction: false,
      },
    },
    layout: {
      ...b.layout,
      [columnId]: [...(b.layout[columnId] || []), { type: "card", id }],
    },
  };
}

export interface UpdateCardArgs {
  id: string;
  patch: Partial<Card>;
}
export function applyUpdateCard(b: BoardState, args: UpdateCardArgs): BoardState {
  return {
    ...b,
    cards: { ...b.cards, [args.id]: { ...b.cards[args.id], ...args.patch } },
  };
}

export interface DeleteCardArgs {
  id: string;
}
export function applyDeleteCard(b: BoardState, args: DeleteCardArgs): BoardState {
  const { id } = args;
  const card = b.cards[id];
  if (!card) return b;
  const nextCards = { ...b.cards };
  delete nextCards[id];

  const nextLayout: BoardState["layout"] = { ...b.layout };
  const nextGroups = { ...b.groups };
  for (const colId of Object.keys(nextLayout)) {
    nextLayout[colId] = nextLayout[colId].filter((it) => !(it.type === "card" && it.id === id));
  }
  for (const gid of Object.keys(nextGroups)) {
    const g = nextGroups[gid];
    if (g.cardIds.includes(id)) {
      nextGroups[gid] = { ...g, cardIds: g.cardIds.filter((x) => x !== id) };
      if (nextGroups[gid].cardIds.length === 0) {
        delete nextGroups[gid];
        for (const colId of Object.keys(nextLayout)) {
          nextLayout[colId] = nextLayout[colId].filter((it) => !(it.type === "group" && it.id === gid));
        }
      }
    }
  }
  const nextActions = b.actions.filter((x) => x !== id);

  if (card.isAction && card.parentCardId && nextCards[card.parentCardId]) {
    nextCards[card.parentCardId] = {
      ...nextCards[card.parentCardId],
      actionCardIds: (nextCards[card.parentCardId].actionCardIds || []).filter((x) => x !== id),
    };
  }
  if (card.actionCardIds?.length) {
    for (const aid of card.actionCardIds) {
      if (nextCards[aid]) nextCards[aid] = { ...nextCards[aid], parentCardId: null };
    }
  }
  return { ...b, cards: nextCards, layout: nextLayout, groups: nextGroups, actions: nextActions };
}

export interface AddCommentArgs {
  cardId: string;
  commentId: string;
  text: string;
  author: Identity;
}
export function applyAddComment(b: BoardState, args: AddCommentArgs): BoardState {
  const c = b.cards[args.cardId];
  if (!c) return b;
  const cm = {
    id: args.commentId,
    text: args.text,
    author: args.author.name,
    authorId: args.author.id,
    authorColor: args.author.color,
  };
  return {
    ...b,
    cards: { ...b.cards, [args.cardId]: { ...c, comments: [...c.comments, cm] } },
  };
}

export interface ReactArgs {
  cardId: string;
  kind: ReactionKey;
  voter: ReactionVote;
}
export function applyReact(b: BoardState, args: ReactArgs): BoardState {
  const c = b.cards[args.cardId];
  if (!c) return b;
  const arr = c.reactions[args.kind] || [];
  const has = arr.some((v) => v.id === args.voter.id);
  const next = has
    ? arr.filter((v) => v.id !== args.voter.id)
    : [...arr, args.voter];
  return {
    ...b,
    cards: {
      ...b.cards,
      [args.cardId]: { ...c, reactions: { ...c.reactions, [args.kind]: next } },
    },
  };
}

export interface CommitActionArgs {
  id: string;
  parentId: string;
  text: string;
  author: Identity;
  assignee: string | null;
  dueDate: string | null;
}
export function applyCommitAction(b: BoardState, args: CommitActionArgs): BoardState {
  const parent = b.cards[args.parentId];
  if (!parent) return b;
  const action: Card = {
    id: args.id,
    columnId: "actions",
    text: args.text,
    author: args.author.name,
    authorId: args.author.id,
    authorColor: args.author.color,
    comments: [],
    reactions: { up: [], celebrate: [], gratitude: [] },
    parentCardId: args.parentId,
    actionCardIds: [],
    isAction: true,
    assignee: args.assignee,
    dueDate: args.dueDate,
  };
  return {
    ...b,
    cards: {
      ...b.cards,
      [args.id]: action,
      [args.parentId]: { ...parent, actionCardIds: [...(parent.actionCardIds || []), args.id] },
    },
    actions: [...b.actions, args.id],
  };
}

export interface AddColumnArgs {
  id: string;
  title: string;
}
export function applyAddColumn(b: BoardState, args: AddColumnArgs): BoardState {
  return {
    ...b,
    columns: [...b.columns, { id: args.id, title: args.title }],
    layout: { ...b.layout, [args.id]: [] },
  };
}

export interface RenameColumnArgs {
  id: string;
  title: string;
}
export function applyRenameColumn(b: BoardState, args: RenameColumnArgs): BoardState {
  return {
    ...b,
    columns: b.columns.map((c) => (c.id === args.id ? { ...c, title: args.title } : c)),
  };
}

export interface DeleteColumnArgs {
  id: string;
}
export function applyDeleteColumn(b: BoardState, args: DeleteColumnArgs): BoardState {
  const { id } = args;
  if (b.columns.length <= 1) return b;
  const items = b.layout[id] || [];
  const cardIdsToRemove: string[] = [];
  const groupIdsToRemove: string[] = [];
  for (const it of items) {
    if (it.type === "group") {
      groupIdsToRemove.push(it.id);
      const g = b.groups[it.id];
      if (g) for (const cid of g.cardIds) cardIdsToRemove.push(cid);
    } else {
      cardIdsToRemove.push(it.id);
    }
  }
  const nextCards = { ...b.cards };
  for (const cid of cardIdsToRemove) {
    const c = nextCards[cid];
    if (!c) continue;
    if (c.actionCardIds?.length) {
      for (const aid of c.actionCardIds) {
        if (nextCards[aid]) nextCards[aid] = { ...nextCards[aid], parentCardId: null };
      }
    }
    delete nextCards[cid];
  }
  const nextGroups = { ...b.groups };
  for (const gid of groupIdsToRemove) delete nextGroups[gid];
  const nextLayout = { ...b.layout };
  delete nextLayout[id];
  return {
    ...b,
    columns: b.columns.filter((c) => c.id !== id),
    layout: nextLayout,
    cards: nextCards,
    groups: nextGroups,
  };
}

export interface DropIntoColumnArgs {
  cardId: string;
  targetColId: string;
}
export function applyDropIntoColumn(b: BoardState, args: DropIntoColumnArgs): BoardState {
  const { cardId, targetColId } = args;
  const card = b.cards[cardId];
  if (!card) return b;
  if (card.isAction) return b;

  const nextLayout: BoardState["layout"] = { ...b.layout };
  const nextGroups = { ...b.groups };
  for (const gid of Object.keys(nextGroups)) {
    const g = nextGroups[gid];
    if (g.cardIds.includes(cardId)) {
      nextGroups[gid] = { ...g, cardIds: g.cardIds.filter((x) => x !== cardId) };
      if (nextGroups[gid].cardIds.length === 0) {
        delete nextGroups[gid];
        for (const col of Object.keys(nextLayout)) {
          nextLayout[col] = nextLayout[col].filter((it) => !(it.type === "group" && it.id === gid));
        }
      }
    }
  }
  for (const col of Object.keys(nextLayout)) {
    nextLayout[col] = nextLayout[col].filter((it) => !(it.type === "card" && it.id === cardId));
  }
  nextLayout[targetColId] = [...(nextLayout[targetColId] || []), { type: "card", id: cardId }];

  const nextCards = {
    ...b.cards,
    [cardId]: { ...card, columnId: targetColId, groupId: null },
  };
  return { ...b, cards: nextCards, layout: nextLayout, groups: nextGroups };
}

export interface DropIntoActionsArgs {
  cardId: string;
}
export function applyDropIntoActions(b: BoardState, args: DropIntoActionsArgs): BoardState {
  const card = b.cards[args.cardId];
  if (!card || !card.isAction) return b;
  const others = b.actions.filter((x) => x !== args.cardId);
  return { ...b, actions: [...others, args.cardId] };
}

export interface DropCardOnCardArgs {
  draggedId: string;
  targetId: string;
  newGroupId: string;
}
export function applyDropCardOnCard(b: BoardState, args: DropCardOnCardArgs): BoardState {
  const { draggedId, targetId, newGroupId } = args;
  const dragged = b.cards[draggedId];
  const target = b.cards[targetId];
  if (!dragged || !target) return b;
  if (target.isAction || dragged.isAction) return b;
  if (draggedId === targetId) return b;

  const nextLayout: BoardState["layout"] = { ...b.layout };
  const nextGroups = { ...b.groups };
  const nextCards = { ...b.cards };

  for (const gid of Object.keys(nextGroups)) {
    const g = nextGroups[gid];
    if (g.cardIds.includes(draggedId)) {
      nextGroups[gid] = { ...g, cardIds: g.cardIds.filter((x) => x !== draggedId) };
      if (nextGroups[gid].cardIds.length === 0) {
        delete nextGroups[gid];
        for (const col of Object.keys(nextLayout)) {
          nextLayout[col] = nextLayout[col].filter((it) => !(it.type === "group" && it.id === gid));
        }
      }
    }
  }
  for (const col of Object.keys(nextLayout)) {
    nextLayout[col] = nextLayout[col].filter((it) => !(it.type === "card" && it.id === draggedId));
  }

  const targetColId = target.columnId;
  let hostGroupId: string | null = null;
  for (const gid of Object.keys(nextGroups)) {
    if (nextGroups[gid].cardIds.includes(targetId)) { hostGroupId = gid; break; }
  }

  if (hostGroupId) {
    const g = nextGroups[hostGroupId];
    nextGroups[hostGroupId] = { ...g, cardIds: [...g.cardIds, draggedId] };
    nextCards[draggedId] = { ...dragged, columnId: g.columnId };
  } else {
    nextGroups[newGroupId] = { id: newGroupId, columnId: targetColId, label: "Cluster", cardIds: [targetId, draggedId] };
    nextLayout[targetColId] = nextLayout[targetColId].map((it: LayoutItem) =>
      it.type === "card" && it.id === targetId ? { type: "group", id: newGroupId } : it
    );
    nextCards[draggedId] = { ...dragged, columnId: targetColId };
  }
  return { ...b, cards: nextCards, layout: nextLayout, groups: nextGroups };
}

export interface DropCardAdjacentArgs {
  draggedId: string;
  targetId: string;
  where: "before" | "after";
}
export function applyDropCardAdjacent(b: BoardState, args: DropCardAdjacentArgs): BoardState {
  const { draggedId, targetId, where } = args;
  const dragged = b.cards[draggedId];
  const target = b.cards[targetId];
  if (!dragged || !target) return b;
  if (target.isAction || dragged.isAction) return b;
  if (draggedId === targetId) return b;

  const nextLayout: BoardState["layout"] = { ...b.layout };
  const nextGroups = { ...b.groups };
  const nextCards = { ...b.cards };

  for (const gid of Object.keys(nextGroups)) {
    const g = nextGroups[gid];
    if (g.cardIds.includes(draggedId)) {
      nextGroups[gid] = { ...g, cardIds: g.cardIds.filter((x) => x !== draggedId) };
      if (nextGroups[gid].cardIds.length === 0) {
        delete nextGroups[gid];
        for (const col of Object.keys(nextLayout)) {
          nextLayout[col] = nextLayout[col].filter((it) => !(it.type === "group" && it.id === gid));
        }
      }
    }
  }
  for (const col of Object.keys(nextLayout)) {
    nextLayout[col] = nextLayout[col].filter((it) => !(it.type === "card" && it.id === draggedId));
  }

  let targetGroupId: string | null = null;
  for (const gid of Object.keys(nextGroups)) {
    if (nextGroups[gid].cardIds.includes(targetId)) { targetGroupId = gid; break; }
  }

  if (targetGroupId) {
    const g = nextGroups[targetGroupId];
    const idx = g.cardIds.indexOf(targetId);
    const insertAt = where === "before" ? idx : idx + 1;
    const ids = [...g.cardIds];
    ids.splice(insertAt, 0, draggedId);
    nextGroups[targetGroupId] = { ...g, cardIds: ids };
    nextCards[draggedId] = { ...dragged, columnId: g.columnId };
  } else {
    const colId = target.columnId;
    const items = nextLayout[colId] || [];
    const idx = items.findIndex((it) => it.type === "card" && it.id === targetId);
    const insertAt = idx < 0 ? items.length : where === "before" ? idx : idx + 1;
    nextLayout[colId] = [
      ...items.slice(0, insertAt),
      { type: "card", id: draggedId },
      ...items.slice(insertAt),
    ];
    nextCards[draggedId] = { ...dragged, columnId: colId };
  }
  return { ...b, cards: nextCards, layout: nextLayout, groups: nextGroups };
}

export interface UnGroupArgs {
  groupId: string;
}
export function applyUnGroup(b: BoardState, args: UnGroupArgs): BoardState {
  const g = b.groups[args.groupId];
  if (!g) return b;
  const nextGroups = { ...b.groups };
  delete nextGroups[args.groupId];
  const nextLayout: BoardState["layout"] = { ...b.layout };
  const items = nextLayout[g.columnId] || [];
  const idx = items.findIndex((it) => it.type === "group" && it.id === args.groupId);
  if (idx >= 0) {
    const expanded = g.cardIds.map((cid) => ({ type: "card" as const, id: cid }));
    nextLayout[g.columnId] = [...items.slice(0, idx), ...expanded, ...items.slice(idx + 1)];
  }
  return { ...b, layout: nextLayout, groups: nextGroups };
}

export interface RenameGroupArgs {
  groupId: string;
  label: string;
}
export function applyRenameGroup(b: BoardState, args: RenameGroupArgs): BoardState {
  return {
    ...b,
    groups: { ...b.groups, [args.groupId]: { ...b.groups[args.groupId], label: args.label } },
  };
}

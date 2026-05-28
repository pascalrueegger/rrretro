"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import type { BoardState, Card as CardT, Group as GroupT, Me, Participant, ReactionKey } from "@/lib/types";
import { formatDue, initials } from "@/lib/util";
import { Trash } from "./icons/Trash";
import { ThumbUp } from "./icons/ThumbUp";
import { Confetti } from "./icons/Confetti";
import { Heart } from "./icons/Heart";
import { SpeechBubble } from "./icons/SpeechBubble";

const REACTIONS: { key: ReactionKey; Icon: (p: { size?: number }) => React.ReactElement; label: string }[] = [
  { key: "up", Icon: ThumbUp, label: "Upvote" },
  { key: "celebrate", Icon: Confetti, label: "Celebrate" },
  { key: "gratitude", Icon: Heart, label: "Gratitude" },
];

type DragInfo = { cardId: string; fromColumnId: string; fromGroupId: string | null } | null;
const dragCtx: { current: DragInfo } = { current: null };

/* ─── ActionMeta ───────────────────────────────────────────────────────── */
function ActionMeta({
  card, onUpdate,
}: { card: CardT; onUpdate: (id: string, patch: Partial<CardT>) => void }) {
  const [editing, setEditing] = useState<"who" | "when" | null>(null);
  const [whoVal, setWhoVal] = useState(card.assignee || "");
  const [whenVal, setWhenVal] = useState(card.dueDate || "");
  const [prevAssignee, setPrevAssignee] = useState(card.assignee);
  const [prevDueDate, setPrevDueDate] = useState(card.dueDate);
  const whoRef = useRef<HTMLInputElement>(null);
  const whenRef = useRef<HTMLInputElement>(null);

  if (prevAssignee !== card.assignee) {
    setPrevAssignee(card.assignee);
    setWhoVal(card.assignee || "");
  }
  if (prevDueDate !== card.dueDate) {
    setPrevDueDate(card.dueDate);
    setWhenVal(card.dueDate || "");
  }
  useEffect(() => {
    if (editing === "who") whoRef.current?.focus();
    if (editing === "when") {
      whenRef.current?.focus();
      const el = whenRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
      try { el?.showPicker?.(); } catch {}
    }
  }, [editing]);

  const commitWho = () => {
    const v = whoVal.trim();
    if (v !== (card.assignee || "")) onUpdate(card.id, { assignee: v || null });
    setEditing(null);
  };
  const commitWhen = () => {
    const v = whenVal || null;
    if (v !== (card.dueDate || null)) onUpdate(card.id, { dueDate: v });
    setEditing(null);
  };
  const overdue =
    !!card.dueDate &&
    new Date(card.dueDate + "T00:00:00") < new Date(new Date().toDateString());

  return (
    <div className="action-meta" onClick={(e) => e.stopPropagation()}>
      {editing === "who" ? (
        <input ref={whoRef}
               className="meta-input"
               value={whoVal}
               placeholder="Assignee"
               onChange={(e) => setWhoVal(e.target.value)}
               onBlur={commitWho}
               onKeyDown={(e) => {
                 if (e.key === "Enter") { e.preventDefault(); commitWho(); }
                 if (e.key === "Escape") { setWhoVal(card.assignee || ""); setEditing(null); }
               }} />
      ) : card.assignee ? (
        <button type="button" className="meta-pill filled" onClick={() => setEditing("who")}>
          <span className="meta-glyph">◐</span>{card.assignee}
        </button>
      ) : (
        <button type="button" className="meta-pill" onClick={() => setEditing("who")}>
          + Assign
        </button>
      )}

      {editing === "when" ? (
        <input ref={whenRef}
               type="date"
               className="meta-input"
               value={whenVal}
               onChange={(e) => setWhenVal(e.target.value)}
               onBlur={commitWhen}
               onKeyDown={(e) => {
                 if (e.key === "Enter") { e.preventDefault(); commitWhen(); }
                 if (e.key === "Escape") { setWhenVal(card.dueDate || ""); setEditing(null); }
               }} />
      ) : card.dueDate ? (
        <button type="button"
                className={`meta-pill filled ${overdue ? "overdue" : ""}`}
                onClick={() => setEditing("when")}>
          <span className="meta-glyph">◷</span>{formatDue(card.dueDate)}
        </button>
      ) : (
        <button type="button" className="meta-pill" onClick={() => setEditing("when")}>
          + Due
        </button>
      )}
    </div>
  );
}

/* ─── Card ─────────────────────────────────────────────────────────────── */
type DropZone = "before" | "cluster" | "after";

interface CardProps {
  card: CardT;
  me: Me;
  hoveredLinkId: string | null;
  onUpdate: (id: string, patch: Partial<CardT>) => void;
  onAddComment: (cardId: string, text: string) => void;
  onReact: (cardId: string, kind: ReactionKey) => void;
  onCreateAction: (parentId: string) => void;
  onDelete: (id: string) => void;
  onLinkHover: (id: string | null) => void;
  onCardDropOnCard: (draggedId: string, targetId: string) => void;
  onCardDropAdjacent: (draggedId: string, targetId: string, where: "before" | "after") => void;
  parentColumnId: string;
  groupId?: string;
  registerCardEl: (id: string, el: HTMLDivElement | null) => void;
}

function Card({
  card, me, hoveredLinkId,
  onUpdate, onAddComment, onReact, onCreateAction, onDelete,
  onLinkHover, onCardDropOnCard, onCardDropAdjacent,
  parentColumnId, groupId, registerCardEl,
}: CardProps) {
  const isAuthor = card.authorId
    ? card.authorId === me.id
    : card.author === me.name; // legacy fallback for boards saved before authorId
  const [editing, setEditing] = useState(card.text === "" && isAuthor);
  const [text, setText] = useState(card.text);
  const [showComments, setShowComments] = useState(false);
  const prevCommentCountRef = useRef(card.comments.length);
  useEffect(() => {
    if (card.comments.length > prevCommentCountRef.current) {
      setShowComments(true);
    }
    prevCommentCountRef.current = card.comments.length;
  }, [card.comments.length]);
  const [comment, setComment] = useState("");
  const [dropZone, setDropZone] = useState<DropZone | null>(null);
  const cardEl = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [prevCardText, setPrevCardText] = useState(card.text);

  if (prevCardText !== card.text) {
    setPrevCardText(card.text);
    setText(card.text);
  }
  useEffect(() => { if (editing) textRef.current?.focus(); }, [editing]);
  useLayoutEffect(() => {
    if (!editing) return;
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text, editing]);

  useLayoutEffect(() => {
    if (cardEl.current) registerCardEl(card.id, cardEl.current);
    return () => registerCardEl(card.id, null);
  }, [card.id, registerCardEl]);

  const commitText = () => {
    const t = text.trim();
    if (!t) { onDelete(card.id); return; }
    if (t !== card.text) onUpdate(card.id, { text: t });
    setEditing(false);
  };

  const submitComment = (e: FormEvent) => {
    e.preventDefault();
    const t = comment.trim();
    if (!t) return;
    onAddComment(card.id, t);
    setComment("");
    setShowComments(true);
  };

  const onDragStart = (e: DragEvent<HTMLDivElement>) => {
    dragCtx.current = { cardId: card.id, fromColumnId: parentColumnId, fromGroupId: groupId || null };
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", card.id); } catch {}
    setTimeout(() => cardEl.current?.classList.add("dragging"), 0);
  };
  const onDragEnd = () => {
    cardEl.current?.classList.remove("dragging");
    dragCtx.current = null;
    setDropZone(null);
  };
  const computeZone = (e: DragEvent<HTMLDivElement>): DropZone => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const h = rect.height;
    if (y < h * 0.25) return "before";
    if (y > h * 0.75) return "after";
    return "cluster";
  };
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    const drag = dragCtx.current;
    if (!drag) return;
    if (card.isAction) return;
    // Over the card being dragged — swallow so column doesn't see it (else
    // its onDrop would append-to-end), but don't show a drop indicator.
    if (drag.cardId === card.id) {
      e.preventDefault();
      e.stopPropagation();
      setDropZone(null);
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropZone(computeZone(e));
    e.stopPropagation();
  };
  const onDragLeave = () => setDropZone(null);
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    const drag = dragCtx.current;
    const zone = dropZone ?? computeZone(e);
    setDropZone(null);
    if (!drag) return;
    if (drag.cardId === card.id) {
      // dropped on itself → no-op, prevent column fallback
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (card.isAction) return;
    e.preventDefault();
    e.stopPropagation();
    if (zone === "cluster") onCardDropOnCard(drag.cardId, card.id);
    else onCardDropAdjacent(drag.cardId, card.id, zone);
  };

  const myReactions = REACTIONS.filter((r) =>
    (card.reactions[r.key] || []).some((v) => v.id === me.id)
  );
  const hasAnyCounts = REACTIONS.some((r) => (card.reactions[r.key] || []).length > 0);

  const linkedAsParent = !!card.actionCardIds && card.actionCardIds.length > 0;
  const isHighlightedByLink =
    !!hoveredLinkId &&
    (
      hoveredLinkId === card.id ||
      hoveredLinkId === card.parentCardId ||
      (card.actionCardIds || []).includes(hoveredLinkId)
    );

  const onCardClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.defaultPrevented) return;
    const t = e.target as HTMLElement;
    if (
      t.closest(".comments") ||
      t.closest(".reaction-bar") ||
      t.closest(".card-foot") ||
      t.closest(".action-meta")
    ) return;
    if (!showComments) setShowComments(true);
  };

  return (
    <div
      ref={cardEl}
      className={[
        "card",
        linkedAsParent ? "has-action" : "",
        card.isAction ? "is-action" : "",
        isHighlightedByLink ? "link-hover" : "",
        dropZone === "cluster" ? "drop-target-card" : "",
        dropZone === "before" ? "drop-insert-before" : "",
        dropZone === "after" ? "drop-insert-after" : "",
      ].filter(Boolean).join(" ")}
      draggable={!editing}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onMouseEnter={() => onLinkHover(card.id)}
      onMouseLeave={() => onLinkHover(null)}
      onClick={onCardClick}
      data-card-id={card.id}
    >
      <div className="reaction-bar" onClick={(e) => e.stopPropagation()}>
        {REACTIONS.map((r) => {
          const has = myReactions.some((m) => m.key === r.key);
          return (
            <button key={r.key} type="button"
                    className={`rxn ${has ? "active" : ""}`}
                    title={r.label}
                    onClick={() => onReact(card.id, r.key)}>
              <r.Icon size={15} />
            </button>
          );
        })}
      </div>

      <div className="card-head">
        <span className="avatar" style={{ background: card.authorColor }}>{initials(card.author)}</span>
        <span className="card-author">{card.author}</span>
        {isAuthor && (
          <span className="card-head-actions">
            <button type="button" className="foot-btn"
                    onClick={() => setEditing(true)}
                    title="Edit card">
              ✎
            </button>
            <button type="button" className="foot-btn"
                    onClick={() => {
                      if (window.confirm("Delete this card?")) onDelete(card.id);
                    }}
                    title="Delete card">
              <Trash />
            </button>
          </span>
        )}
      </div>

      {editing ? (
        <textarea
          ref={textRef}
          className="card-body-input"
          value={text}
          rows={2}
          placeholder={card.isAction ? "What's the action?" : "What's on your mind?"}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commitText(); }
            if (e.key === "Escape") { e.preventDefault(); commitText(); }
          }}
        />
      ) : (
        <div className="card-body" onDoubleClick={() => { if (isAuthor) setEditing(true); }}>{card.text}</div>
      )}

      {card.isAction && <ActionMeta card={card} onUpdate={onUpdate} />}

      <div className="card-foot">
        {hasAnyCounts && (
          <span className="rxn-counts">
            {REACTIONS.map((r) => {
              const votes = card.reactions[r.key] || [];
              const count = votes.length;
              if (!count) return null;
              const mine = votes.some((v) => v.id === me.id);
              return (
                <span key={r.key} className={`rxn-chip ${mine ? "mine" : ""}`}
                      data-tip={votes.map((v) => v.name).join("\n")}>
                  <r.Icon size={11} /> {count}
                </span>
              );
            })}
          </span>
        )}
        {card.parentCardId && <span className="action-pill">↳ action</span>}
        <span className="card-foot-spacer" />
        <button type="button" className="foot-btn"
                onClick={() => setShowComments((s) => !s)}
                title="Comments">
          <SpeechBubble /> {card.comments.length || ""}
        </button>
        {!card.isAction && (
          <button type="button" className="foot-btn"
                  onClick={() => onCreateAction(card.id)}
                  title="Create action item from this card">
            + action
          </button>
        )}
      </div>

      {showComments && (
        <div className="comments" onClick={(e) => e.stopPropagation()}>
          {card.comments.map((c) => (
            <div className="comment" key={c.id}>
              <span className="avatar" style={{ background: c.authorColor }}>{initials(c.author)}</span>
              <div className="comment-bubble">
                <span className="who">{c.author}</span>{c.text}
              </div>
            </div>
          ))}
          <form className="comment-input" onSubmit={submitComment}>
            <input value={comment}
                   placeholder="Add a comment…"
                   onChange={(e) => setComment(e.target.value)} />
            <button type="submit" className="btn btn-sm" disabled={!comment.trim()}>Send</button>
          </form>
        </div>
      )}
    </div>
  );
}

/* ─── Group ────────────────────────────────────────────────────────────── */
function GroupView({
  group, children, onUnGroup, onRenameGroup,
}: {
  group: GroupT;
  children: ReactNode;
  onUnGroup: (id: string) => void;
  onRenameGroup: (id: string, label: string) => void;
}) {
  const [label, setLabel] = useState(group.label);
  const [prevGroupLabel, setPrevGroupLabel] = useState(group.label);
  if (prevGroupLabel !== group.label) {
    setPrevGroupLabel(group.label);
    setLabel(group.label);
  }
  const commit = () => {
    if (label.trim() !== group.label) onRenameGroup(group.id, label.trim() || "Cluster");
  };
  return (
    <div className="group">
      <div className="group-label">
        <input value={label}
               style={{
                 background: "transparent", border: 0, outline: "none",
                 color: "inherit", fontSize: "inherit", letterSpacing: "inherit",
                 textTransform: "inherit", flex: 1, fontFamily: "inherit", padding: 0,
               }}
               onChange={(e) => setLabel(e.target.value)}
               onBlur={commit}
               onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
        <span className="x" title="Break apart" onClick={() => onUnGroup(group.id)}>×</span>
      </div>
      {children}
    </div>
  );
}

/* ─── Column ───────────────────────────────────────────────────────────── */
interface ColumnProps {
  column: { id: string; title: string; locked?: boolean };
  layout: BoardState["layout"];
  cards: BoardState["cards"];
  groups: BoardState["groups"];
  me: Me;
  hoveredLinkId: string | null;
  onAddCard: (columnId: string, text: string) => void;
  onUpdateCard: (id: string, patch: Partial<CardT>) => void;
  onAddComment: (cardId: string, text: string) => void;
  onReact: (cardId: string, kind: ReactionKey) => void;
  onCreateAction: (parentId: string) => void;
  onDeleteCard: (id: string) => void;
  onRenameColumn: (id: string, title: string) => void;
  onDeleteColumn: (id: string) => void;
  onLinkHover: (id: string | null) => void;
  onCardDropOnCard: (draggedId: string, targetId: string) => void;
  onCardDropAdjacent: (draggedId: string, targetId: string, where: "before" | "after") => void;
  onDropIntoColumn: (cardId: string, targetColId: string) => void;
  onUnGroup: (id: string) => void;
  onRenameGroup: (id: string, label: string) => void;
  registerCardEl: (id: string, el: HTMLDivElement | null) => void;
  autoFocusTitle: boolean;
  onTitleFocused: () => void;
  typers: Participant[];
  onTyping: (columnId: string, active: boolean) => void;
}

function Column(props: ColumnProps) {
  const {
    column, layout, cards, groups, me, hoveredLinkId,
    onAddCard, onUpdateCard, onAddComment, onReact, onCreateAction, onDeleteCard,
    onRenameColumn, onDeleteColumn, onLinkHover, onCardDropOnCard, onCardDropAdjacent,
    onDropIntoColumn, onUnGroup, onRenameGroup, registerCardEl,
    autoFocusTitle, onTitleFocused, typers, onTyping,
  } = props;
  const [adding, setAdding] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const items = layout[column.id] || [];

  useEffect(() => { if (adding) draftRef.current?.focus(); }, [adding]);
  useLayoutEffect(() => {
    if (!adding) return;
    const el = draftRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draftText, adding]);

  // Broadcast typing state when draft is open.
  useEffect(() => {
    if (!adding) return;
    onTyping(column.id, true);
    return () => onTyping(column.id, false);
  }, [adding, column.id, onTyping]);
  useEffect(() => {
    if (autoFocusTitle && titleRef.current) {
      titleRef.current.focus();
      titleRef.current.select();
      onTitleFocused();
    }
  }, [autoFocusTitle, onTitleFocused]);

  const submitDraft = () => {
    const t = draftText.trim();
    if (t) onAddCard(column.id, t);
    setDraftText("");
    setAdding(false);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!dragCtx.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(true);
  };
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOver(false);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    setDragOver(false);
    if (!dragCtx.current) return;
    e.preventDefault();
    const draggedId = dragCtx.current.cardId;
    const dragged = cards[draggedId];
    // already in this column → keep position; only move when crossing columns
    if (dragged && dragged.columnId === column.id) return;
    onDropIntoColumn(draggedId, column.id);
  };

  return (
    <div className="column">
      <div className="col-head">
        <input className="col-title"
               ref={titleRef}
               value={column.title}
               placeholder="Column title"
               onChange={(e) => onRenameColumn(column.id, e.target.value)} />
        {(() => {
          const count = items.reduce(
            (n, it) =>
              n + (it.type === "group" ? (groups[it.id]?.cardIds.length || 0) : 1),
            0
          );
          return (
            <>
              {count > 0 && <span className="col-count">{count}</span>}
              {!column.locked && me.isHost && count === 0 && (
                <button type="button" className="btn btn-ghost btn-sm col-menu"
                        title="Delete column"
                        onClick={() => onDeleteColumn(column.id)}>×</button>
              )}
            </>
          );
        })()}
      </div>

      <div className={`col-body ${dragOver ? "drag-over" : ""}`}
           onDragOver={onDragOver}
           onDragLeave={onDragLeave}
           onDrop={onDrop}>
        {items.map((it) => {
          if (it.type === "group") {
            const g = groups[it.id];
            if (!g) return null;
            return (
              <GroupView key={`g-${g.id}`} group={g}
                         onUnGroup={onUnGroup} onRenameGroup={onRenameGroup}>
                {g.cardIds.map((cid) => cards[cid] && (
                  <Card key={cid} card={cards[cid]} me={me}
                        hoveredLinkId={hoveredLinkId}
                        onUpdate={onUpdateCard} onAddComment={onAddComment}
                        onReact={onReact} onCreateAction={onCreateAction}
                        onDelete={onDeleteCard}
                        onLinkHover={onLinkHover}
                        onCardDropOnCard={onCardDropOnCard}
                        onCardDropAdjacent={onCardDropAdjacent}
                        parentColumnId={column.id}
                        groupId={g.id}
                        registerCardEl={registerCardEl} />
                ))}
              </GroupView>
            );
          }
          const c = cards[it.id];
          if (!c) return null;
          return (
            <Card key={c.id} card={c} me={me}
                  hoveredLinkId={hoveredLinkId}
                  onUpdate={onUpdateCard} onAddComment={onAddComment}
                  onReact={onReact} onCreateAction={onCreateAction}
                  onDelete={onDeleteCard}
                  onLinkHover={onLinkHover}
                  onCardDropOnCard={onCardDropOnCard}
                  onCardDropAdjacent={onCardDropAdjacent}
                  parentColumnId={column.id}
                  registerCardEl={registerCardEl} />
          );
        })}

        {typers.length > 0 && (
          <div className="col-typing" title={typers.map((t) => t.name).join(", ")}>
            <span className="col-typing-avatars">
              {typers.slice(0, 3).map((t) => (
                <span key={t.id} className="avatar" style={{ background: t.color }}>{t.initial}</span>
              ))}
            </span>
            <span className="col-typing-text">
              {typers.length === 1 ? `${typers[0].name} is writing` : `${typers.length} people writing`}
              <span className="col-typing-dots"><i /><i /><i /></span>
            </span>
          </div>
        )}

        {adding ? (
          <div className="card" style={{ cursor: "default" }}>
            <div className="card-head">
              <span className="avatar" style={{ background: me.color }}>{initials(me.name)}</span>
              <span className="card-author">{me.name}</span>
            </div>
            <textarea ref={draftRef}
                      className="card-body-input"
                      rows={2}
                      placeholder="What's on your mind?"
                      value={draftText}
                      onChange={(e) => setDraftText(e.target.value)}
                      onBlur={submitDraft}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitDraft(); }
                        if (e.key === "Escape") { setDraftText(""); setAdding(false); }
                      }} />
            <div className="hint" style={{ marginTop: 4 }}>
              <span className="kbd">↵</span> save · <span className="kbd">esc</span> cancel
            </div>
          </div>
        ) : (
          <button className="add-card-btn" onClick={() => setAdding(true)}>
            <span className="plus">+</span> Add card
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Actions Sidebar ──────────────────────────────────────────────────── */
function ActionsSidebar({
  actionIds, cards, me, hoveredLinkId, collapsed, onToggle,
  onUpdateCard, onAddComment, onReact, onDeleteCard,
  onLinkHover, registerCardEl, onDropIntoActions,
}: {
  actionIds: string[];
  cards: BoardState["cards"];
  me: Me;
  hoveredLinkId: string | null;
  collapsed: boolean;
  onToggle: () => void;
  onUpdateCard: (id: string, patch: Partial<CardT>) => void;
  onAddComment: (cardId: string, text: string) => void;
  onReact: (cardId: string, kind: ReactionKey) => void;
  onDeleteCard: (id: string) => void;
  onLinkHover: (id: string | null) => void;
  registerCardEl: (id: string, el: HTMLDivElement | null) => void;
  onDropIntoActions: (id: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!dragCtx.current) return;
    const c = cards[dragCtx.current.cardId];
    if (!c || !c.isAction) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(true);
  };
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOver(false);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    setDragOver(false);
    if (!dragCtx.current) return;
    const c = cards[dragCtx.current.cardId];
    if (!c || !c.isAction) return;
    e.preventDefault();
    onDropIntoActions(dragCtx.current.cardId);
  };

  return (
    <aside className={`actions-rail ${collapsed ? "collapsed" : ""}`}>
      <div className="actions-head">
        <div className="actions-title">
          <span className="dot" />
          <span className="actions-title-text">Actions</span>
          {!collapsed && <span className="actions-count">{actionIds.length}</span>}
        </div>
        {!collapsed && (
          <button type="button" className="actions-toggle"
                  title="Collapse" onClick={onToggle}>›</button>
        )}
        {collapsed && (
          <button type="button" className="actions-toggle"
                  style={{ marginTop: "auto" }}
                  title="Expand" onClick={onToggle}>‹</button>
        )}
      </div>
      {!collapsed && (
        <div className={`actions-body ${dragOver ? "drag-over" : ""}`}
             onDragOver={onDragOver}
             onDragLeave={onDragLeave}
             onDrop={onDrop}>
          {actionIds.length === 0 && (
            <div className="actions-empty">
              No actions yet.<br />
              Hover any card and click <strong>+ action</strong>.
            </div>
          )}
          {actionIds.map((id) => cards[id] && (
            <Card key={id} card={cards[id]} me={me}
                  hoveredLinkId={hoveredLinkId}
                  onUpdate={onUpdateCard} onAddComment={onAddComment}
                  onReact={onReact} onDelete={onDeleteCard}
                  onLinkHover={onLinkHover}
                  parentColumnId="actions"
                  registerCardEl={registerCardEl}
                  onCreateAction={() => {}}
                  onCardDropOnCard={() => {}}
                  onCardDropAdjacent={() => {}} />
          ))}
        </div>
      )}
    </aside>
  );
}

/* ─── Connectors ───────────────────────────────────────────────────────── */
function Connectors({
  pairs, cardEls, containerEl,
}: {
  pairs: [string, string][];
  cardEls: React.MutableRefObject<Record<string, HTMLDivElement>>;
  containerEl: HTMLDivElement | null;
}) {
  const [, forceRedraw] = useState(0);
  useEffect(() => {
    const handler = () => forceRedraw((n) => n + 1);
    window.addEventListener("resize", handler);
    const obs = new ResizeObserver(handler);
    if (containerEl) obs.observe(containerEl);
    const scrollEl = containerEl?.querySelector(".board-scroll") as HTMLElement | null;
    scrollEl?.addEventListener("scroll", handler);
    const actionsBody = containerEl?.querySelector(".actions-body") as HTMLElement | null;
    actionsBody?.addEventListener("scroll", handler);
    return () => {
      window.removeEventListener("resize", handler);
      obs.disconnect();
      scrollEl?.removeEventListener("scroll", handler);
      actionsBody?.removeEventListener("scroll", handler);
    };
  }, [containerEl]);

  if (!containerEl) return null;
  const cBox = containerEl.getBoundingClientRect();
  const segs = pairs
    .map(([aId, bId]) => {
      const aEl = cardEls.current[aId];
      const bEl = cardEls.current[bId];
      if (!aEl || !bEl) return null;
      const aBox = aEl.getBoundingClientRect();
      const bBox = bEl.getBoundingClientRect();
      const ax = (aBox.right > bBox.right ? aBox.left : aBox.right) - cBox.left;
      const ay = aBox.top + aBox.height / 2 - cBox.top;
      const bx = (bBox.right > aBox.right ? bBox.left : bBox.right) - cBox.left;
      const by = bBox.top + bBox.height / 2 - cBox.top;
      const dx = bx - ax;
      return {
        ax, ay, bx, by,
        c1x: ax + dx * 0.4, c1y: ay,
        c2x: bx - dx * 0.4, c2y: by,
        key: `${aId}-${bId}`,
      };
    })
    .filter(Boolean) as Array<{ax:number;ay:number;bx:number;by:number;c1x:number;c1y:number;c2x:number;c2y:number;key:string}>;

  return (
    <div className="connector-layer">
      <svg>
        {segs.map((s) => (
          <g key={s.key}>
            <path className="connector-line"
                  d={`M ${s.ax} ${s.ay} C ${s.c1x} ${s.c1y} ${s.c2x} ${s.c2y} ${s.bx} ${s.by}`} />
            <circle className="connector-dot" cx={s.ax} cy={s.ay} r="3" />
            <circle className="connector-dot" cx={s.bx} cy={s.by} r="3" />
          </g>
        ))}
      </svg>
    </div>
  );
}

export { Card, GroupView, Column, ActionsSidebar, Connectors, REACTIONS };
export type { CardProps };

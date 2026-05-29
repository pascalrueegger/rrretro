"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { Card as CardT, Me, ReactionKey } from "@/lib/types";
import { formatDue, initials } from "@/lib/util";
import { Trash } from "../icons/Trash";
import { ThumbUp } from "../icons/ThumbUp";
import { Confetti } from "../icons/Confetti";
import { Heart } from "../icons/Heart";
import { SpeechBubble } from "../icons/SpeechBubble";
import { dragCtx, type DropZone } from "./dragCtx";

export const REACTIONS: { key: ReactionKey; Icon: (p: { size?: number }) => React.ReactElement; label: string }[] = [
  { key: "up", Icon: ThumbUp, label: "Upvote" },
  { key: "celebrate", Icon: Confetti, label: "Celebrate" },
  { key: "gratitude", Icon: Heart, label: "Gratitude" },
];

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

export interface CardProps {
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

export function Card({
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

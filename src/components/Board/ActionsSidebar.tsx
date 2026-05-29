"use client";

import { useState, type DragEvent } from "react";
import type { BoardState, Card as CardT, Me, ReactionKey } from "@/lib/types";
import { Card } from "./Card";
import { dragCtx } from "./dragCtx";

export function ActionsSidebar({
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

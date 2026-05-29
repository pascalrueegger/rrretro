"use client";

import { useMemo } from "react";
import {
  applyAddCard,
  applyAddColumn,
  applyAddComment,
  applyCommitAction,
  applyDeleteCard,
  applyDeleteColumn,
  applyDropCardAdjacent,
  applyDropCardOnCard,
  applyDropIntoActions,
  applyDropIntoColumn,
  applyReact,
  applyRenameColumn,
  applyRenameGroup,
  applyUnGroup,
  applyUpdateCard,
} from "@/lib/board";
import { uid } from "@/lib/util";
import type { BoardState, Card, Me, ReactionKey } from "@/lib/types";

export interface UseBoardMutatorsArgs {
  me: Me | null;
  updateBoard: (fn: (b: BoardState) => BoardState) => void;
  onColumnAdded?: (id: string) => void;
}

export interface BoardMutators {
  addCard: (columnId: string, text: string) => void;
  updateCard: (id: string, patch: Partial<Card>) => void;
  deleteCard: (id: string) => void;
  addComment: (cardId: string, text: string) => void;
  react: (cardId: string, kind: ReactionKey) => void;
  addColumn: () => void;
  renameColumn: (id: string, title: string) => void;
  deleteColumn: (id: string) => void;
  dropIntoColumn: (cardId: string, targetColId: string) => void;
  dropIntoActions: (cardId: string) => void;
  dropCardOnCard: (draggedId: string, targetId: string) => void;
  dropCardAdjacent: (draggedId: string, targetId: string, where: "before" | "after") => void;
  unGroup: (groupId: string) => void;
  renameGroup: (groupId: string, label: string) => void;
  commitAction: (args: {
    parentId: string;
    text: string;
    assignee: string | null;
    dueDate: string | null;
  }) => void;
}

export function buildBoardMutators({
  me,
  updateBoard,
  onColumnAdded,
}: UseBoardMutatorsArgs): BoardMutators {
  return {
    addCard(columnId, text) {
      if (!me) return;
      const id = uid("c");
      const author = { id: me.id, name: me.name, color: me.color };
      updateBoard((b) => applyAddCard(b, { id, columnId, text, author }));
    },
    updateCard(id, patch) {
      updateBoard((b) => applyUpdateCard(b, { id, patch }));
    },
    deleteCard(id) {
      updateBoard((b) => applyDeleteCard(b, { id }));
    },
    addComment(cardId, text) {
      if (!me) return;
      const commentId = uid("cm");
      const author = { id: me.id, name: me.name, color: me.color };
      updateBoard((b) => applyAddComment(b, { cardId, commentId, text, author }));
    },
    react(cardId, kind) {
      if (!me) return;
      const voter = { id: me.id, name: me.name };
      updateBoard((b) => applyReact(b, { cardId, kind, voter }));
    },
    addColumn() {
      const id = uid("col");
      updateBoard((b) => applyAddColumn(b, { id, title: "New column" }));
      onColumnAdded?.(id);
    },
    renameColumn(id, title) {
      updateBoard((b) => applyRenameColumn(b, { id, title }));
    },
    deleteColumn(id) {
      updateBoard((b) => applyDeleteColumn(b, { id }));
    },
    dropIntoColumn(cardId, targetColId) {
      updateBoard((b) => applyDropIntoColumn(b, { cardId, targetColId }));
    },
    dropIntoActions(cardId) {
      updateBoard((b) => applyDropIntoActions(b, { cardId }));
    },
    dropCardOnCard(draggedId, targetId) {
      const newGroupId = uid("g");
      updateBoard((b) => applyDropCardOnCard(b, { draggedId, targetId, newGroupId }));
    },
    dropCardAdjacent(draggedId, targetId, where) {
      updateBoard((b) => applyDropCardAdjacent(b, { draggedId, targetId, where }));
    },
    unGroup(groupId) {
      updateBoard((b) => applyUnGroup(b, { groupId }));
    },
    renameGroup(groupId, label) {
      updateBoard((b) => applyRenameGroup(b, { groupId, label }));
    },
    commitAction({ parentId, text, assignee, dueDate }) {
      if (!me) return;
      const id = uid("a");
      const author = { id: me.id, name: me.name, color: me.color };
      updateBoard((b) => applyCommitAction(b, { id, parentId, text, author, assignee, dueDate }));
    },
  };
}

export function useBoardMutators(args: UseBoardMutatorsArgs): BoardMutators {
  const { me, updateBoard, onColumnAdded } = args;
  return useMemo(
    () => buildBoardMutators({ me, updateBoard, onColumnAdded }),
    [me, updateBoard, onColumnAdded],
  );
}

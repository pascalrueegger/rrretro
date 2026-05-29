// Module-scoped drag state shared between Card / Column / ActionsSidebar.
// HTML5 drag events don't carry payload reliably across drag-leave so we
// stash the dragged card identity here and read it from drop handlers.
export type DragInfo = {
  cardId: string;
  fromColumnId: string;
  fromGroupId: string | null;
} | null;

export const dragCtx: { current: DragInfo } = { current: null };

export type DropZone = "before" | "cluster" | "after";

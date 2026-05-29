export type ReactionKey = "up" | "celebrate" | "gratitude";

export interface ReactionVote {
  id: string;   // participant id — identity check
  name: string; // snapshot of name at vote time — display only
}

export type Reactions = Record<ReactionKey, ReactionVote[]>;

export interface Comment {
  id: string;
  text: string;
  author: string;
  authorId: string;
  authorColor: string;
}

export interface Card {
  id: string;
  columnId: string;
  text: string;
  author: string;
  authorId: string;
  authorColor: string;
  comments: Comment[];
  reactions: Reactions;
  parentCardId: string | null;
  actionCardIds: string[];
  isAction: boolean;
  assignee?: string | null;
  dueDate?: string | null;
  groupId?: string | null;
}

export interface Column {
  id: string;
  title: string;
  locked?: boolean;
}

export type LayoutItem = { type: "card"; id: string } | { type: "group"; id: string };

export interface Group {
  id: string;
  columnId: string;
  label: string;
  cardIds: string[];
}

export interface BoardState {
  columns: Column[];
  layout: Record<string, LayoutItem[]>;
  cards: Record<string, Card>;
  groups: Record<string, Group>;
  actions: string[];
}

export interface Me {
  id: string;
  name: string;
  color: string;
  initial: string;
  isHost: boolean;
}

export interface SessionInfo {
  id: string;
  title: string;
  code: string;
  hostName: string;
  hostPeerId?: string | null;
  sharing: boolean;
  createdAt: number;
  joinToken?: string;
}

export interface Participant {
  id: string;
  name: string;
  color: string;
  initial: string;
}

export type Tweaks = {
  theme: "light" | "dark" | "random";
  density: "compact" | "regular" | "comfy";
  flavor: "swiss" | "editorial" | "mono" | "hand";
};

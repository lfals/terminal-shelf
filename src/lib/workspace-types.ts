export type ThreadStatus = "idle" | "running" | "closed" | "errored";
export type ThreadTitleSource = "auto" | "manual";
export type SplitDirection = "horizontal" | "vertical";

export interface Project {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  updatedAt: string;
}

export interface Thread {
  id: string;
  projectId: string;
  title: string;
  titleSource: ThreadTitleSource;
  lastAutoTitle: string | null;
  status: ThreadStatus;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
}

export interface WorkspaceLeafNode {
  type: "leaf";
  threadId: string;
}

export interface WorkspaceSplitNode {
  type: "split";
  direction: SplitDirection;
  first: WorkspaceLayoutNode;
  second: WorkspaceLayoutNode;
}

export type WorkspaceLayoutNode = WorkspaceLeafNode | WorkspaceSplitNode;

export interface WorkspaceSnapshot {
  projects: Project[];
  threads: Thread[];
  activeThreadId: string | null;
  layout: WorkspaceLayoutNode | null;
}

export interface TerminalDataEvent {
  threadId: string;
  data: string;
}

export interface TerminalExitEvent {
  threadId: string;
  exitCode: number;
  signal?: number;
}

export interface TerminalStatusEvent {
  threadId: string;
  status: ThreadStatus;
}

export interface ThreadUpdatedEvent {
  thread: Thread;
}

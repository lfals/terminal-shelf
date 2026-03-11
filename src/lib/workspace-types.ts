export type ThreadStatus = "idle" | "running" | "closed" | "errored";

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
  status: ThreadStatus;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
}

export interface WorkspaceSnapshot {
  projects: Project[];
  threads: Thread[];
  activeThreadId: string | null;
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

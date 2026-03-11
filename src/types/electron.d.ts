import type {
  Project,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalStatusEvent,
  Thread,
  WorkspaceSnapshot,
} from "@/lib/workspace-types";

declare global {
  interface Window {
    desktop?: {
      runtime: {
        platform: string;
        versions: {
          chrome: string;
          electron: string;
          node: string;
        };
      };
      openExternal: (url: string) => Promise<void>;
      projects: {
        list: () => Promise<Project[]>;
        create: () => Promise<Project | null>;
        remove: (projectId: string) => Promise<void>;
      };
      threads: {
        create: (projectId: string) => Promise<Thread>;
        list: (projectId: string) => Promise<Thread[]>;
        open: (threadId: string) => Promise<{ thread: Thread }>;
        close: (threadId: string) => Promise<void>;
        remove: (threadId: string) => Promise<void>;
      };
      terminal: {
        write: (threadId: string, data: string) => Promise<void>;
        resize: (threadId: string, cols: number, rows: number) => Promise<void>;
        onData: (listener: (payload: TerminalDataEvent) => void) => () => void;
        onExit: (listener: (payload: TerminalExitEvent) => void) => () => void;
        onStatus: (listener: (payload: TerminalStatusEvent) => void) => () => void;
      };
      workspace: {
        getSnapshot: () => Promise<WorkspaceSnapshot>;
      };
    };
  }
}

export {};

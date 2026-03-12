import { contextBridge, ipcRenderer } from "electron";
import type {
  Project,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalStatusEvent,
  Thread,
  ThreadUpdatedEvent,
  WorkspaceSnapshot,
} from "../src/lib/workspace-types";

const onChannel = <T>(channel: string, listener: (payload: T) => void) => {
  const wrapped = (_event: unknown, payload: T) => listener(payload);
  ipcRenderer.on(channel, wrapped);

  return () => {
    ipcRenderer.removeListener(channel, wrapped);
  };
};

contextBridge.exposeInMainWorld("desktop", {
  runtime: {
    platform: process.platform,
    versions: {
      chrome: process.versions.chrome,
      electron: process.versions.electron,
      node: process.versions.node,
    },
  },
  openExternal: (url: string) => ipcRenderer.invoke("desktop:open-external", url),
  projects: {
    list: (): Promise<Project[]> => ipcRenderer.invoke("projects:list"),
    create: (): Promise<Project | null> => ipcRenderer.invoke("projects:create"),
    remove: (projectId: string): Promise<void> =>
      ipcRenderer.invoke("projects:remove", projectId),
  },
  threads: {
    create: (projectId: string): Promise<Thread> =>
      ipcRenderer.invoke("threads:create", projectId),
    list: (projectId: string): Promise<Thread[]> =>
      ipcRenderer.invoke("threads:list", projectId),
    rename: (threadId: string, title: string): Promise<Thread> =>
      ipcRenderer.invoke("threads:rename", threadId, title),
    open: (threadId: string): Promise<{ thread: Thread }> =>
      ipcRenderer.invoke("threads:open", threadId),
    close: (threadId: string): Promise<void> =>
      ipcRenderer.invoke("threads:close", threadId),
    remove: (threadId: string): Promise<void> =>
      ipcRenderer.invoke("threads:remove", threadId),
    onUpdated: (listener: (payload: ThreadUpdatedEvent) => void) =>
      onChannel("threads:updated", listener),
  },
  terminal: {
    write: (threadId: string, data: string): Promise<void> =>
      ipcRenderer.invoke("terminal:write", threadId, data),
    resize: (threadId: string, cols: number, rows: number): Promise<void> =>
      ipcRenderer.invoke("terminal:resize", threadId, cols, rows),
    onData: (listener: (payload: TerminalDataEvent) => void) =>
      onChannel("terminal:data", listener),
    onExit: (listener: (payload: TerminalExitEvent) => void) =>
      onChannel("terminal:exit", listener),
    onStatus: (listener: (payload: TerminalStatusEvent) => void) =>
      onChannel("terminal:status", listener),
  },
  workspace: {
    getSnapshot: (): Promise<WorkspaceSnapshot> =>
      ipcRenderer.invoke("workspace:getSnapshot"),
  },
});

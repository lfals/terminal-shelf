import { contextBridge, ipcRenderer } from "electron";
import type {
  Project,
  ProjectBatchCreateResult,
  ProjectGroup,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalStatusEvent,
  Thread,
  WorkspaceLayoutNode,
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
    create: (targetGroupId: string | null = null): Promise<ProjectBatchCreateResult | null> =>
      ipcRenderer.invoke("projects:create", targetGroupId),
    remove: (projectId: string): Promise<void> =>
      ipcRenderer.invoke("projects:remove", projectId),
    moveToGroup: (projectId: string, groupId: string | null): Promise<Project> =>
      ipcRenderer.invoke("projects:move-to-group", projectId, groupId),
  },
  groups: {
    create: (name: string): Promise<ProjectGroup> =>
      ipcRenderer.invoke("groups:create", name),
    rename: (groupId: string, name: string): Promise<ProjectGroup> =>
      ipcRenderer.invoke("groups:rename", groupId, name),
    remove: (groupId: string, removeProjects: boolean): Promise<void> =>
      ipcRenderer.invoke("groups:remove", groupId, removeProjects),
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
    onThreadData: (threadId: string, listener: (payload: TerminalDataEvent) => void) =>
      onChannel(`terminal:data:${threadId}`, listener),
    onExit: (listener: (payload: TerminalExitEvent) => void) =>
      onChannel("terminal:exit", listener),
    onThreadExit: (threadId: string, listener: (payload: TerminalExitEvent) => void) =>
      onChannel(`terminal:exit:${threadId}`, listener),
    onStatus: (listener: (payload: TerminalStatusEvent) => void) =>
      onChannel("terminal:status", listener),
    onThreadStatus: (threadId: string, listener: (payload: TerminalStatusEvent) => void) =>
      onChannel(`terminal:status:${threadId}`, listener),
  },
  workspace: {
    getSnapshot: (): Promise<WorkspaceSnapshot> =>
      ipcRenderer.invoke("workspace:getSnapshot"),
    updateLayout: (layout: WorkspaceLayoutNode | null, activeThreadId: string | null) =>
      ipcRenderer.invoke("workspace:updateLayout", layout, activeThreadId),
  },
});

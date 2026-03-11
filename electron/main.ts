import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import os from "node:os";
import { spawn, type IPty } from "node-pty";
import type {
  Project,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalStatusEvent,
  Thread,
  ThreadStatus,
  WorkspaceSnapshot,
} from "../src/lib/workspace-types";

type WorkspaceStore = WorkspaceSnapshot;

const rendererUrl = process.env.ELECTRON_RENDERER_URL;
const STORE_FILE_NAME = "workspace.json";
const DEFAULT_TERMINAL_SIZE = { cols: 80, rows: 24 };

const isSafeExternalUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

const normalizeProjectPath = (inputPath: string) => {
  const resolvedPath = resolve(inputPath);

  try {
    const normalizedPath = realpathSync.native?.(resolvedPath) ?? realpathSync(resolvedPath);
    return process.platform === "win32" ? normalizedPath.toLowerCase() : normalizedPath;
  } catch {
    return process.platform === "win32" ? resolvedPath.toLowerCase() : resolvedPath;
  }
};

const createDefaultStore = (): WorkspaceStore => ({
  projects: [],
  threads: [],
  activeThreadId: null,
});

const normalizeLoadedStore = (rawValue: unknown): WorkspaceStore => {
  const fallback = createDefaultStore();

  if (!rawValue || typeof rawValue !== "object") {
    return fallback;
  }

  const source = rawValue as Partial<WorkspaceStore>;
  const projects = Array.isArray(source.projects) ? source.projects : [];
  const threads = Array.isArray(source.threads) ? source.threads : [];

  return {
    projects: projects.map((project) => ({
      ...project,
      path: normalizeProjectPath(project.path),
    })),
    threads: threads.map((thread) => ({
      ...thread,
      status: thread.status === "running" ? "closed" : thread.status,
      lastOpenedAt: thread.lastOpenedAt ?? null,
    })),
    activeThreadId: typeof source.activeThreadId === "string" ? source.activeThreadId : null,
  };
};

class WorkspaceRepository {
  private readonly filePath: string;

  private store: WorkspaceStore;

  constructor() {
    const directory = app.getPath("userData");
    mkdirSync(directory, { recursive: true });
    this.filePath = join(directory, STORE_FILE_NAME);
    this.store = this.readStore();
  }

  listProjects() {
    return [...this.store.projects];
  }

  listThreads(projectId?: string) {
    const threads = projectId
      ? this.store.threads.filter((thread) => thread.projectId === projectId)
      : this.store.threads;

    return [...threads];
  }

  getSnapshot(): WorkspaceSnapshot {
    return {
      projects: this.listProjects(),
      threads: this.listThreads(),
      activeThreadId: this.store.activeThreadId,
    };
  }

  createProject(projectPath: string) {
    const normalizedPath = normalizeProjectPath(projectPath);
    const existingProject = this.store.projects.find((project) => project.path === normalizedPath);

    if (existingProject) {
      throw new Error("PROJECT_EXISTS");
    }

    const now = new Date().toISOString();
    const project: Project = {
      id: randomUUID(),
      name: basename(normalizedPath),
      path: normalizedPath,
      createdAt: now,
      updatedAt: now,
    };

    this.store.projects.push(project);
    this.save();

    return project;
  }

  removeProject(projectId: string) {
    const project = this.getProject(projectId);
    this.store.projects = this.store.projects.filter((item) => item.id !== project.id);
    const removedThreadIds = this.store.threads
      .filter((thread) => thread.projectId === project.id)
      .map((thread) => thread.id);
    this.store.threads = this.store.threads.filter((thread) => thread.projectId !== project.id);

    if (removedThreadIds.includes(this.store.activeThreadId ?? "")) {
      this.store.activeThreadId = null;
    }

    this.save();
    return removedThreadIds;
  }

  createThread(projectId: string) {
    this.getProject(projectId);
    const threadCount = this.store.threads.filter((thread) => thread.projectId === projectId).length;
    const now = new Date().toISOString();
    const thread: Thread = {
      id: randomUUID(),
      projectId,
      title: `Terminal ${threadCount + 1}`,
      status: "idle",
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: null,
    };

    this.store.threads.push(thread);
    this.store.activeThreadId = thread.id;
    this.save();

    return thread;
  }

  openThread(threadId: string, status: ThreadStatus = "running") {
    const thread = this.getThread(threadId);
    const now = new Date().toISOString();
    const updatedThread: Thread = {
      ...thread,
      status,
      updatedAt: now,
      lastOpenedAt: now,
    };

    this.store.threads = this.store.threads.map((item) =>
      item.id === threadId ? updatedThread : item
    );
    this.store.activeThreadId = threadId;
    this.save();

    return updatedThread;
  }

  updateThreadStatus(threadId: string, status: ThreadStatus) {
    const thread = this.getThread(threadId);
    const updatedThread: Thread = {
      ...thread,
      status,
      updatedAt: new Date().toISOString(),
    };

    this.store.threads = this.store.threads.map((item) =>
      item.id === threadId ? updatedThread : item
    );
    this.save();

    return updatedThread;
  }

  removeThread(threadId: string) {
    this.getThread(threadId);
    this.store.threads = this.store.threads.filter((thread) => thread.id !== threadId);

    if (this.store.activeThreadId === threadId) {
      this.store.activeThreadId = null;
    }

    this.save();
  }

  closeThread(threadId: string) {
    return this.updateThreadStatus(threadId, "closed");
  }

  getProject(projectId: string) {
    const project = this.store.projects.find((item) => item.id === projectId);

    if (!project) {
      throw new Error("PROJECT_NOT_FOUND");
    }

    return project;
  }

  getThread(threadId: string) {
    const thread = this.store.threads.find((item) => item.id === threadId);

    if (!thread) {
      throw new Error("THREAD_NOT_FOUND");
    }

    return thread;
  }

  private readStore() {
    if (!existsSync(this.filePath)) {
      return createDefaultStore();
    }

    try {
      const content = readFileSync(this.filePath, "utf8");
      return normalizeLoadedStore(JSON.parse(content));
    } catch {
      return createDefaultStore();
    }
  }

  private save() {
    writeFileSync(this.filePath, JSON.stringify(this.store, null, 2), "utf8");
  }
}

class PtyManager {
  private readonly sessions = new Map<string, IPty>();

  constructor(private readonly repository: WorkspaceRepository) {}

  openThread(threadId: string) {
    const existingSession = this.sessions.get(threadId);
    const thread = this.repository.getThread(threadId);
    const project = this.repository.getProject(thread.projectId);

    if (existingSession) {
      return this.repository.openThread(threadId);
    }

    const session = this.spawnForProject(project.path);
    this.sessions.set(threadId, session);

    session.onData((data) => {
      this.broadcast<TerminalDataEvent>("terminal:data", {
        threadId,
        data,
      });
    });

    session.onExit(({ exitCode, signal }) => {
      this.sessions.delete(threadId);

      try {
        this.repository.closeThread(threadId);
      } catch {
        return;
      }

      this.broadcast<TerminalStatusEvent>("terminal:status", {
        threadId,
        status: "closed",
      });

      this.broadcast<TerminalExitEvent>("terminal:exit", {
        threadId,
        exitCode,
        signal,
      });
    });

    const openedThread = this.repository.openThread(threadId);
    this.broadcast<TerminalStatusEvent>("terminal:status", {
      threadId,
      status: openedThread.status,
    });

    return openedThread;
  }

  closeThread(threadId: string) {
    const session = this.sessions.get(threadId);

    if (session) {
      this.sessions.delete(threadId);
      session.kill();
    }

    const thread = this.repository.closeThread(threadId);
    this.broadcast<TerminalStatusEvent>("terminal:status", {
      threadId,
      status: thread.status,
    });

    return thread;
  }

  removeThread(threadId: string) {
    const session = this.sessions.get(threadId);

    if (session) {
      this.sessions.delete(threadId);
      session.kill();
    }
  }

  write(threadId: string, data: string) {
    const session = this.sessions.get(threadId);

    if (!session) {
      throw new Error("THREAD_NOT_RUNNING");
    }

    session.write(data);
  }

  resize(threadId: string, cols: number, rows: number) {
    const session = this.sessions.get(threadId);

    if (!session) {
      return;
    }

    session.resize(Math.max(cols, 20), Math.max(rows, 8));
  }

  disposeAll() {
    for (const session of this.sessions.values()) {
      session.kill();
    }

    this.sessions.clear();
  }

  private spawnForProject(cwd: string) {
    const env = {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    };

    const candidates =
      process.platform === "win32"
        ? [
            { file: "powershell.exe", args: [] as string[] },
            { file: "cmd.exe", args: [] as string[] },
          ]
        : process.platform === "darwin"
          ? [
              { file: process.env.SHELL || "/bin/zsh", args: ["-l"] },
              { file: "/bin/zsh", args: ["-l"] },
              { file: "/bin/bash", args: ["-l"] },
            ]
          : [
              { file: process.env.SHELL || "/bin/bash", args: ["-l"] },
              { file: "/bin/bash", args: ["-l"] },
              { file: "/bin/sh", args: ["-l"] },
            ];

    let lastError: unknown = null;

    for (const candidate of candidates) {
      try {
        return spawn(candidate.file, candidate.args, {
          name: "xterm-256color",
          cwd,
          cols: DEFAULT_TERMINAL_SIZE.cols,
          rows: DEFAULT_TERMINAL_SIZE.rows,
          env,
        });
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Unable to start terminal.");
  }

  private broadcast<T>(channel: string, payload: T) {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(channel, payload);
    }
  }
}

let repository: WorkspaceRepository;
let ptyManager: PtyManager;

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: "#0a0f1e",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url);
    }

    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const currentUrl = mainWindow.webContents.getURL();

    if (url !== currentUrl) {
      event.preventDefault();
    }
  });

  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl);
    return mainWindow;
  }

  const rendererHtml = join(__dirname, "..", "out", "index.html");

  if (!existsSync(rendererHtml)) {
    throw new Error(
      `Renderer export not found at ${rendererHtml}. Run "bun run build" before starting Electron.`
    );
  }

  void mainWindow.loadFile(rendererHtml);

  return mainWindow;
}

app.whenReady().then(() => {
  repository = new WorkspaceRepository();
  ptyManager = new PtyManager(repository);

  ipcMain.handle("desktop:open-external", async (_event, url: string) => {
    if (!isSafeExternalUrl(url)) {
      throw new Error("Blocked unsafe external URL.");
    }

    await shell.openExternal(url);
  });

  ipcMain.handle("workspace:getSnapshot", () => repository.getSnapshot());

  ipcMain.handle("projects:list", () => repository.listProjects());
  ipcMain.handle("projects:create", async () => {
    const result = await dialog.showOpenDialog({
      title: "Add project folder",
      buttonLabel: "Add project",
      properties: ["openDirectory", "createDirectory"],
      defaultPath: os.homedir(),
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return repository.createProject(result.filePaths[0]);
  });
  ipcMain.handle("projects:remove", (_event, projectId: string) => {
    const removedThreadIds = repository.removeProject(projectId);
    for (const threadId of removedThreadIds) {
      ptyManager.removeThread(threadId);
    }
  });

  ipcMain.handle("threads:list", (_event, projectId: string) => repository.listThreads(projectId));
  ipcMain.handle("threads:create", (_event, projectId: string) => repository.createThread(projectId));
  ipcMain.handle("threads:open", (_event, threadId: string) => ({
    thread: ptyManager.openThread(threadId),
  }));
  ipcMain.handle("threads:close", (_event, threadId: string) => {
    ptyManager.closeThread(threadId);
  });
  ipcMain.handle("threads:remove", (_event, threadId: string) => {
    ptyManager.removeThread(threadId);
    repository.removeThread(threadId);
  });

  ipcMain.handle("terminal:write", (_event, threadId: string, data: string) => {
    ptyManager.write(threadId, data);
  });
  ipcMain.handle("terminal:resize", (_event, threadId: string, cols: number, rows: number) => {
    ptyManager.resize(threadId, cols, rows);
  });

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("before-quit", () => {
  ptyManager?.disposeAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

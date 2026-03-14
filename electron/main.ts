import { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, shell } from "electron";
import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
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
  ThreadUpdatedEvent,
  WorkspaceSnapshot,
} from "../src/lib/workspace-types";

type WorkspaceStore = WorkspaceSnapshot;

const rendererUrl = process.env.ELECTRON_RENDERER_URL;
const STORE_FILE_NAME = "workspace.json";
const DEFAULT_TERMINAL_SIZE = { cols: 80, rows: 24 };
const MAX_THREAD_TITLE_LENGTH = 80;
const isDevelopmentMode = Boolean(rendererUrl);
const appDisplayName = isDevelopmentMode ? "Term Shelf - Dev" : "Term";

interface ThreadInputState {
  buffer: string;
  cursor: number;
  escapeSequence: string | null;
  hasComplexEdit: boolean;
}

const trimThreadTitle = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, MAX_THREAD_TITLE_LENGTH);

const buildDefaultThreadTitle = (threadCount: number) => `Terminal ${threadCount + 1}`;

const normalizeThreadTitle = (value: string) => trimThreadTitle(value);

const createThreadInputState = (): ThreadInputState => ({
  buffer: "",
  cursor: 0,
  escapeSequence: null,
  hasComplexEdit: false,
});

const removePreviousWord = (value: string, cursor: number) => {
  const beforeCursor = value.slice(0, cursor).replace(/\s+$/, "");
  const nextCursor = beforeCursor.replace(/\S+$/, "").length;

  return {
    value: `${beforeCursor.slice(0, nextCursor)}${value.slice(cursor)}`,
    cursor: nextCursor,
  };
};

const isPrintableInput = (character: string) => {
  const codePoint = character.codePointAt(0);
  return codePoint !== undefined && codePoint >= 0x20 && codePoint !== 0x7f;
};

const isEscapeSequenceComplete = (sequence: string) => /[\x40-\x7e]$/.test(sequence);

const applyEscapeSequence = (state: ThreadInputState, sequence: string) => {
  switch (sequence) {
    case "\u001b[D":
      state.cursor = Math.max(0, state.cursor - 1);
      return;
    case "\u001b[C":
      state.cursor = Math.min(state.buffer.length, state.cursor + 1);
      return;
    case "\u001b[H":
    case "\u001bOH":
      state.cursor = 0;
      return;
    case "\u001b[F":
    case "\u001bOF":
      state.cursor = state.buffer.length;
      return;
    case "\u001b[3~":
      if (state.cursor < state.buffer.length) {
        state.buffer = `${state.buffer.slice(0, state.cursor)}${state.buffer.slice(state.cursor + 1)}`;
      }
      return;
    default:
      state.hasComplexEdit = true;
  }
};

const extractCommandTitle = (value: string) => {
  const normalized = trimThreadTitle(value);
  return normalized.length > 0 ? normalized : null;
};

const resolveAppAssetPath = (...segments: string[]) => {
  const candidateRoots = [
    process.cwd(),
    app.getAppPath(),
    join(app.getAppPath(), ".."),
    process.resourcesPath,
    join(process.resourcesPath, "app.asar"),
  ];

  const candidatePaths = [...new Set(candidateRoots.map((rootPath) => join(rootPath, ...segments)))];
  const existingPath = candidatePaths.find((candidatePath) => existsSync(candidatePath));

  return existingPath ?? candidatePaths[0];
};

const ensureNodePtySpawnHelperExecutable = () => {
  if (process.platform !== "darwin") {
    return;
  }

  const arch = process.arch === "arm64" ? "darwin-arm64" : "darwin-x64";
  const candidateRoots = [
    process.cwd(),
    app.getAppPath(),
    join(app.getAppPath(), ".."),
    process.resourcesPath,
    join(process.resourcesPath, "app.asar.unpacked"),
  ];
  const helperRelativePath = join("node_modules", "node-pty", "prebuilds", arch, "spawn-helper");

  for (const rootPath of candidateRoots) {
    const helperPath = join(rootPath, helperRelativePath);

    if (!existsSync(helperPath)) {
      continue;
    }

    try {
      chmodSync(helperPath, 0o755);
      return;
    } catch {
      // Try the next candidate path.
    }
  }
};

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
      title: normalizeThreadTitle(thread.title),
      titleSource: thread.titleSource === "manual" ? "manual" : "auto",
      lastAutoTitle: normalizeThreadTitle(thread.lastAutoTitle ?? thread.title),
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
    const defaultTitle = buildDefaultThreadTitle(threadCount);
    const thread: Thread = {
      id: randomUUID(),
      projectId,
      title: defaultTitle,
      titleSource: "auto",
      lastAutoTitle: defaultTitle,
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

  renameThread(threadId: string, title: string) {
    const thread = this.getThread(threadId);
    const now = new Date().toISOString();
    const normalizedTitle = normalizeThreadTitle(title);

    const updatedThread: Thread =
      normalizedTitle.length === 0
        ? {
            ...thread,
            title: thread.lastAutoTitle ?? thread.title,
            titleSource: "auto",
            updatedAt: now,
          }
        : {
            ...thread,
            title: normalizedTitle,
            titleSource: "manual",
            updatedAt: now,
          };

    this.store.threads = this.store.threads.map((item) =>
      item.id === threadId ? updatedThread : item
    );
    this.save();

    return updatedThread;
  }

  applyAutoThreadTitle(threadId: string, title: string) {
    const thread = this.getThread(threadId);
    const normalizedTitle = normalizeThreadTitle(title);

    if (normalizedTitle.length === 0) {
      return null;
    }

    const updatedThread: Thread = {
      ...thread,
      title: thread.titleSource === "manual" ? thread.title : normalizedTitle,
      titleSource: thread.titleSource,
      lastAutoTitle: normalizedTitle,
      updatedAt: new Date().toISOString(),
    };

    const hasChanges =
      updatedThread.title !== thread.title ||
      updatedThread.lastAutoTitle !== thread.lastAutoTitle;

    if (!hasChanges) {
      return null;
    }

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
  private readonly inputStates = new Map<string, ThreadInputState>();

  constructor(private readonly repository: WorkspaceRepository) {}

  openThread(threadId: string) {
    const existingSession = this.sessions.get(threadId);
    const thread = this.repository.getThread(threadId);
    const project = this.repository.getProject(thread.projectId);

    if (existingSession) {
      if (!this.inputStates.has(threadId)) {
        this.inputStates.set(threadId, createThreadInputState());
      }
      return this.repository.openThread(threadId);
    }

    const session = this.spawnForProject(project.path);
    this.sessions.set(threadId, session);
    this.inputStates.set(threadId, createThreadInputState());

    session.onData((data) => {
      this.broadcast<TerminalDataEvent>("terminal:data", {
        threadId,
        data,
      });
    });

    session.onExit(({ exitCode, signal }) => {
      this.sessions.delete(threadId);
      this.inputStates.delete(threadId);

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
      this.inputStates.delete(threadId);
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
      this.inputStates.delete(threadId);
      session.kill();
    }
  }

  write(threadId: string, data: string) {
    const session = this.sessions.get(threadId);

    if (!session) {
      throw new Error("THREAD_NOT_RUNNING");
    }

    this.updateThreadTitleFromInput(threadId, data);
    session.write(data);
  }

  resize(threadId: string, cols: number, rows: number) {
    const session = this.sessions.get(threadId);

    if (!session) {
      return;
    }

    session.resize(Math.max(cols, 20), Math.max(rows, 8));
  }

  broadcastThreadUpdated(thread: Thread) {
    this.broadcast<ThreadUpdatedEvent>("threads:updated", { thread });
  }

  disposeAll() {
    for (const session of this.sessions.values()) {
      session.kill();
    }

    this.sessions.clear();
    this.inputStates.clear();
  }

  private spawnForProject(cwd: string) {
    const locale = process.env.LC_ALL || process.env.LC_CTYPE || process.env.LANG || "en_US.UTF-8";
    const env = {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      LANG: locale,
      LC_ALL: locale,
      LC_CTYPE: locale,
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

  private updateThreadTitleFromInput(threadId: string, data: string) {
    const state = this.inputStates.get(threadId) ?? createThreadInputState();
    this.inputStates.set(threadId, state);

    for (const character of data) {
      if (state.escapeSequence !== null || character === "\u001b") {
        state.escapeSequence = `${state.escapeSequence ?? ""}${character}`;

        if (isEscapeSequenceComplete(state.escapeSequence)) {
          applyEscapeSequence(state, state.escapeSequence);
          state.escapeSequence = null;
        }

        continue;
      }

      switch (character) {
        case "\r": {
          const commandTitle = state.hasComplexEdit ? null : extractCommandTitle(state.buffer);

          if (commandTitle) {
            const updatedThread = this.repository.applyAutoThreadTitle(threadId, commandTitle);

            if (updatedThread && updatedThread.titleSource === "auto") {
              this.broadcast<ThreadUpdatedEvent>("threads:updated", {
                thread: updatedThread,
              });
            }
          }

          state.buffer = "";
          state.cursor = 0;
          state.hasComplexEdit = false;
          state.escapeSequence = null;
          break;
        }
        case "\u0003":
          state.buffer = "";
          state.cursor = 0;
          state.hasComplexEdit = false;
          state.escapeSequence = null;
          break;
        case "\u0001":
          state.cursor = 0;
          break;
        case "\u0005":
          state.cursor = state.buffer.length;
          break;
        case "\u0015":
          state.buffer = "";
          state.cursor = 0;
          state.hasComplexEdit = false;
          break;
        case "\u0017": {
          const nextState = removePreviousWord(state.buffer, state.cursor);
          state.buffer = nextState.value;
          state.cursor = nextState.cursor;
          break;
        }
        case "\u007f":
        case "\b":
          if (state.cursor > 0) {
            state.buffer = `${state.buffer.slice(0, state.cursor - 1)}${state.buffer.slice(state.cursor)}`;
            state.cursor -= 1;
          }
          break;
        default:
          if (!isPrintableInput(character)) {
            break;
          }

          state.buffer = `${state.buffer.slice(0, state.cursor)}${character}${state.buffer.slice(state.cursor)}`;
          state.cursor += character.length;
      }
    }
  }
}

let repository: WorkspaceRepository;
let ptyManager: PtyManager;
let tray: Tray | null = null;

function resolveIconAssetPath() {
  return resolveAppAssetPath("public", isDevelopmentMode ? "logo-term-dev.png" : "logo-term.png");
}

function createTrayIconImage() {
  const image = nativeImage.createFromPath(resolveIconAssetPath());

  if (image.isEmpty()) {
    throw new Error(`Tray icon not found at ${resolveIconAssetPath()}.`);
  }

  if (process.platform === "darwin") {
    return image.resize({ width: 18, height: 18 });
  }

  return image.resize({ width: 32, height: 32 });
}

function ensureTray(mainWindow: BrowserWindow) {
  if (tray) {
    tray.setImage(createTrayIconImage());
    return tray;
  }

  tray = new Tray(createTrayIconImage());
  tray.setToolTip(appDisplayName);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: `Show ${appDisplayName}`,
        click: () => {
          if (mainWindow.isMinimized()) {
            mainWindow.restore();
          }
          mainWindow.show();
          mainWindow.focus();
        },
      },
      {
        label: "Quit",
        click: () => app.quit(),
      },
    ])
  );
  tray.on("click", () => {
    if (mainWindow.isVisible() && mainWindow.isFocused()) {
      mainWindow.hide();
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.show();
    mainWindow.focus();
  });

  return tray;
}

function createMainWindow() {
  const preloadScript = resolveAppAssetPath(".electron", "preload.js");
  const iconPath = resolveIconAssetPath();

  if (!existsSync(preloadScript)) {
    throw new Error(
      `Preload script not found at ${preloadScript}. Run "bun run build:electron" before starting Electron.`
    );
  }

  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: "#0a0f1e",
    icon: iconPath,
    title: appDisplayName,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: preloadScript,
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

  if (process.platform === "darwin") {
    app.setName(appDisplayName);
    app.dock.setIcon(iconPath);
  }

  ensureTray(mainWindow);

  if (rendererUrl) {
    void mainWindow.loadURL(rendererUrl);
    return mainWindow;
  }

  const rendererHtml = resolveAppAssetPath("out", "index.html");

  if (!existsSync(rendererHtml)) {
    throw new Error(
      `Renderer export not found at ${rendererHtml}. Run "bun run build" before starting Electron.`
    );
  }

  void mainWindow.loadFile(rendererHtml);

  return mainWindow;
}

app.whenReady().then(() => {
  ensureNodePtySpawnHelperExecutable();
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
  ipcMain.handle("threads:rename", (_event, threadId: string, title: string) => {
    const thread = repository.renameThread(threadId, title);
    ptyManager.broadcastThreadUpdated(thread);
    return thread;
  });
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
  tray?.destroy();
  tray = null;
  ptyManager?.disposeAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

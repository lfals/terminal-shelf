"use client";

import dynamic from "next/dynamic";
import { startTransition, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { FolderPlus, LoaderCircle, MonitorCog, Plus, X } from "lucide-react";
import { toast } from "sonner";
import packageJson from "../../package.json";

import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  collectSplitThreadIds,
  createLeafNode,
  getFirstThreadId,
  hasThreadInLayout,
  removeThreadFromLayout,
  replaceLeafWithSplit,
} from "@/lib/workspace-layout";
import { getRuntimeInfo } from "@/lib/runtime";
import type {
  Project,
  ProjectBatchCreateResult,
  ProjectGroup,
  SplitDirection,
  Thread,
  ThreadStatus,
  WorkspaceLayoutNode,
  WorkspaceSnapshot,
} from "@/lib/workspace-types";

const MAX_BUFFER_SIZE = 120_000;
const MAX_BUFFERED_THREADS = 40;
type MainView = "terminal" | "settings";
const APP_VERSION = packageJson.version;
const DEFAULT_UPDATE_REPOSITORY = "lfals/terminal-shelf";
const UPDATE_REPOSITORY = process.env.NEXT_PUBLIC_UPDATE_REPOSITORY ?? DEFAULT_UPDATE_REPOSITORY;
const TerminalPane = dynamic(
  () => import("@/components/terminal/terminal-pane").then((module) => module.TerminalPane),
  {
    ssr: false,
  }
);

const trimBuffer = (value: string) => {
  if (value.length <= MAX_BUFFER_SIZE) {
    return value;
  }

  const sliceStart = value.length - MAX_BUFFER_SIZE;
  const newlineStart = value.indexOf("\n", sliceStart);
  const candidate =
    newlineStart >= 0 && newlineStart + 1 < value.length
      ? value.slice(newlineStart + 1)
      : value.slice(sliceStart);

  return candidate.replace(/^(?:\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?|\u001b(?:\[[0-?]*[ -/]*[@-~]?|[@-_]?))/, "");
};

const touchBufferThread = (threadIds: string[], threadId: string) => {
  const currentIndex = threadIds.indexOf(threadId);
  if (currentIndex >= 0) {
    threadIds.splice(currentIndex, 1);
  }
  threadIds.push(threadId);
};

const updateThread = (threads: Thread[], nextThread: Thread) =>
  threads.map((thread) => (thread.id === nextThread.id ? nextThread : thread));

const resolveNextActiveThreadId = (
  layout: WorkspaceLayoutNode | null,
  candidateThreadId: string | null
) => {
  if (candidateThreadId && hasThreadInLayout(layout, candidateThreadId)) {
    return candidateThreadId;
  }

  return getFirstThreadId(layout);
};

export function WorkspaceShell() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [layout, setLayout] = useState<WorkspaceLayoutNode | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<MainView>("terminal");
  const [runtimeInfo, setRuntimeInfo] = useState(() => getRuntimeInfo(undefined));
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [updateDownloadUrl, setUpdateDownloadUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const terminalBuffersRef = useRef<Record<string, string>>({});
  const bufferTouchOrderRef = useRef<string[]>([]);
  const activeThreadIdRef = useRef<string | null>(null);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? null,
    [activeThreadId, threads]
  );
  const threadById = useMemo(() => new Map(threads.map((thread) => [thread.id, thread])), [threads]);
  const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);
  const runtime = runtimeInfo.runtime;
  const splitThreadIds = useMemo(() => collectSplitThreadIds(layout), [layout]);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    if (!errorMessage) {
      return;
    }

    toast.error("Workspace error", {
      description: errorMessage,
    });
    setErrorMessage(null);
  }, [errorMessage]);

  const applySnapshot = (snapshot: WorkspaceSnapshot) => {
    startTransition(() => {
      setGroups(snapshot.groups ?? []);
      setProjects(snapshot.projects ?? []);
      setThreads(snapshot.threads ?? []);
      setLayout(snapshot.layout ?? null);
      setActiveThreadId(snapshot.activeThreadId ?? null);
    });
  };

  const persistLayout = async (nextLayout: WorkspaceLayoutNode | null, nextActiveThreadId: string | null) => {
    const desktop = window.desktop;

    if (!desktop) {
      return null;
    }

    const snapshot = await desktop.workspace.updateLayout(nextLayout, nextActiveThreadId);
    applySnapshot(snapshot);
    return snapshot;
  };

  const focusThread = async (threadId: string, preferredLayout?: WorkspaceLayoutNode | null) => {
    const nextLayout = hasThreadInLayout(preferredLayout ?? layout, threadId)
      ? preferredLayout ?? layout
      : createLeafNode(threadId);

    await persistLayout(nextLayout, threadId);
    startTransition(() => {
      setActiveView("terminal");
    });
  };

  const handleSplitShortcut = useEffectEvent((direction: SplitDirection) => {
    void handleSplitActiveThread(direction);
  });

  const handleCloseShortcut = useEffectEvent(() => {
    if (!activeThreadId) {
      return;
    }

    void handleRemoveThread(activeThreadId);
  });

  useEffect(() => {
    const desktop = window.desktop;
    const currentRuntimeInfo = getRuntimeInfo(window);
    setRuntimeInfo(currentRuntimeInfo);

    if (!desktop) {
      setIsLoading(false);
      setErrorMessage(
        currentRuntimeInfo.isDesktopApp
          ? "O app esta rodando no Electron, mas a bridge desktop nao foi exposta pelo preload."
          : "A API do Electron nao esta disponivel nesta execucao web."
      );
      return;
    }

    void desktop.workspace
      .getSnapshot()
      .then((snapshot) => {
        applySnapshot(snapshot);

        if (snapshot.activeThreadId) {
          return desktop.threads.open(snapshot.activeThreadId).then(({ thread }) => {
            startTransition(() => {
              setThreads((currentThreads) => updateThread(currentThreads, thread));
              setActiveThreadId(thread.id);
            });
          });
        }

        return undefined;
      })
      .catch((error: unknown) => {
        setErrorMessage(getErrorMessage(error));
      })
      .finally(() => setIsLoading(false));

    const disposeData = desktop.terminal.onData(({ threadId, data }) => {
      const currentValue = terminalBuffersRef.current[threadId] ?? "";
      terminalBuffersRef.current[threadId] = trimBuffer(`${currentValue}${data}`);
      touchBufferThread(bufferTouchOrderRef.current, threadId);
      while (bufferTouchOrderRef.current.length > MAX_BUFFERED_THREADS) {
        const evictedThreadId = bufferTouchOrderRef.current.shift();
        if (!evictedThreadId || evictedThreadId === activeThreadIdRef.current) {
          continue;
        }
        delete terminalBuffersRef.current[evictedThreadId];
      }
    });

    const disposeStatus = desktop.terminal.onStatus(({ threadId, status }) => {
      startTransition(() => {
        setThreads((currentThreads) =>
          currentThreads.map((thread) =>
            thread.id === threadId ? { ...thread, status, updatedAt: new Date().toISOString() } : thread
          )
        );
      });
    });

    const disposeExit = desktop.terminal.onExit(({ threadId }) => {
      startTransition(() => {
        setThreads((currentThreads) =>
          currentThreads.map((thread) =>
            thread.id === threadId
              ? { ...thread, status: "closed", updatedAt: new Date().toISOString() }
              : thread
          )
        );
      });
    });

    const disposeThreadUpdated = desktop.threads.onUpdated(({ thread }) => {
      startTransition(() => {
        setThreads((currentThreads) => updateThread(currentThreads, thread));
      });
    });

    return () => {
      disposeData();
      disposeStatus();
      disposeExit();
      disposeThreadUpdated();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const isMacOS = /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
      const hasPrimaryModifier = isMacOS ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
      const isEditableTarget =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ((target.tagName === "INPUT" || target.tagName === "TEXTAREA") &&
            !target.classList.contains("xterm-helper-textarea")));

      if (
        !hasPrimaryModifier ||
        isEditableTarget ||
        activeView !== "terminal" ||
        !activeThreadId ||
        isBusy
      ) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "d" && !event.shiftKey) {
        event.preventDefault();
        handleSplitShortcut("vertical");
        return;
      }

      if (key === "d" && event.shiftKey) {
        event.preventDefault();
        handleSplitShortcut("horizontal");
        return;
      }

      if (key === "w" && !event.shiftKey) {
        event.preventDefault();
        handleCloseShortcut();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeThreadId, activeView, isBusy]);

  const handleAddProject = async (groupId?: string | null) => {
    const desktop = window.desktop;

    if (!desktop) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      const result = await desktop.projects.create(groupId ?? null);

      if (!result) {
        return;
      }
      const changedProjects = [...result.added, ...result.moved];
      if (changedProjects.length > 0) {
        startTransition(() => {
          setProjects((currentProjects) => mergeProjects(currentProjects, changedProjects));
        });
        toast.success("Projetos atualizados", {
          description: formatBatchAddSummary(result, groupId ?? null, groupById),
        });
      } else {
        toast.info("Nenhuma alteração", {
          description: formatBatchAddSummary(result, groupId ?? null, groupById),
        });
      }
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error, "Não foi possível adicionar o projeto.")
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleRemoveProject = async (projectId: string) => {
    const desktop = window.desktop;

    if (!desktop) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      const removedThreadIds = new Set(
        threads.filter((thread) => thread.projectId === projectId).map((thread) => thread.id)
      );

      await desktop.projects.remove(projectId);

      for (const threadId of removedThreadIds) {
        delete terminalBuffersRef.current[threadId];
      }

      const nextLayout = [...removedThreadIds].reduce(
        (currentLayout, threadId) => removeThreadFromLayout(currentLayout, threadId),
        layout
      );
      const nextThreads = threads.filter((thread) => thread.projectId !== projectId);
      const nextActiveThreadId = resolveNextActiveThreadId(
        nextLayout,
        activeThreadId && removedThreadIds.has(activeThreadId) ? null : activeThreadId
      );

      startTransition(() => {
        setProjects((currentProjects) => currentProjects.filter((project) => project.id !== projectId));
        setThreads(nextThreads);
        setLayout(nextLayout);
        setActiveThreadId(nextActiveThreadId);
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreateGroup = async (name: string) => {
    const desktop = window.desktop;

    if (!desktop) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      const group = await desktop.groups.create(name);
      startTransition(() => {
        setGroups((currentGroups) => [...currentGroups, group]);
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleRenameGroup = async (groupId: string, name: string) => {
    const desktop = window.desktop;

    if (!desktop) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      const group = await desktop.groups.rename(groupId, name);
      startTransition(() => {
        setGroups((currentGroups) =>
          currentGroups.map((item) => (item.id === group.id ? group : item))
        );
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleRemoveGroup = async (groupId: string, removeProjects: boolean) => {
    const desktop = window.desktop;

    if (!desktop) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      let removedThreadIds = new Set<string>();
      let nextLayout = layout;
      let nextThreads = threads;
      let nextActiveThreadId = activeThreadId;

      if (removeProjects) {
        const removedProjectIds = new Set(
          projects.filter((project) => project.groupId === groupId).map((project) => project.id)
        );
        removedThreadIds = new Set(
          threads
            .filter((thread) => removedProjectIds.has(thread.projectId))
            .map((thread) => thread.id)
        );

        nextLayout = [...removedThreadIds].reduce(
          (currentLayout, threadId) => removeThreadFromLayout(currentLayout, threadId),
          layout
        );
        nextThreads = threads.filter((thread) => !removedThreadIds.has(thread.id));
        nextActiveThreadId = resolveNextActiveThreadId(
          nextLayout,
          activeThreadId && removedThreadIds.has(activeThreadId) ? null : activeThreadId
        );
      }

      await desktop.groups.remove(groupId, removeProjects);

      for (const threadId of removedThreadIds) {
        delete terminalBuffersRef.current[threadId];
      }

      startTransition(() => {
        setGroups((currentGroups) => currentGroups.filter((item) => item.id !== groupId));
        if (removeProjects) {
          setProjects((currentProjects) =>
            currentProjects.filter((project) => project.groupId !== groupId)
          );
          setThreads(nextThreads);
          setLayout(nextLayout);
          setActiveThreadId(nextActiveThreadId);
          return;
        }

        setProjects((currentProjects) =>
          currentProjects.map((project) =>
            project.groupId === groupId ? { ...project, groupId: null } : project
          )
        );
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleMoveProjectToGroup = async (projectId: string, groupId: string | null) => {
    const desktop = window.desktop;

    if (!desktop) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      const project = await desktop.projects.moveToGroup(projectId, groupId);
      startTransition(() => {
        setProjects((currentProjects) =>
          currentProjects.map((item) => (item.id === project.id ? project : item))
        );
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreateThread = async (projectId: string) => {
    const desktop = window.desktop;

    if (!desktop) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      const thread = await desktop.threads.create(projectId);
      startTransition(() => {
        setThreads((currentThreads) => [...currentThreads, thread]);
      });
      await handleOpenThread(thread.id);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleOpenThread = async (threadId: string) => {
    const desktop = window.desktop;

    if (!desktop) {
      return;
    }

    setErrorMessage(null);

    try {
      const { thread } = await desktop.threads.open(threadId);
      startTransition(() => {
        setThreads((currentThreads) => updateThread(currentThreads, thread));
      });
      await focusThread(thread.id);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  };

  const handleSelectThread = (threadId: string) => {
    setErrorMessage(null);
    void focusThread(threadId);
  };

  const handleCloseThread = async (threadId: string) => {
    const desktop = window.desktop;

    if (!desktop) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      await desktop.threads.close(threadId);
      startTransition(() => {
        setThreads((currentThreads) =>
          currentThreads.map((thread) =>
            thread.id === threadId ? { ...thread, status: "closed", updatedAt: new Date().toISOString() } : thread
          )
        );
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleRemoveThread = async (threadId: string) => {
    const desktop = window.desktop;

    if (!desktop) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      await desktop.threads.remove(threadId);
      delete terminalBuffersRef.current[threadId];

      const nextLayout = removeThreadFromLayout(layout, threadId);
      const nextThreads = threads.filter((thread) => thread.id !== threadId);
      const nextActiveThreadId = resolveNextActiveThreadId(
        nextLayout,
        activeThreadId === threadId ? null : activeThreadId
      );

      startTransition(() => {
        setThreads(nextThreads);
        setLayout(nextLayout);
        setActiveThreadId(nextActiveThreadId);
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleRenameThread = async (threadId: string, title: string) => {
    const desktop = window.desktop;

    if (!desktop) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      const thread = await desktop.threads.rename(threadId, title);
      startTransition(() => {
        setThreads((currentThreads) => updateThread(currentThreads, thread));
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Nao foi possivel renomear o terminal."));
    } finally {
      setIsBusy(false);
    }
  };

  const handleSplitActiveThread = async (direction: SplitDirection) => {
    const desktop = window.desktop;

    if (!desktop || !activeThread) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      const createdThread = await desktop.threads.create(activeThread.projectId);
      startTransition(() => {
        setThreads((currentThreads) => [...currentThreads, createdThread]);
      });

      const { thread: openedThread } = await desktop.threads.open(createdThread.id);
      startTransition(() => {
        setThreads((currentThreads) => updateThread(currentThreads, openedThread));
      });

      const baseLayout = hasThreadInLayout(layout, activeThread.id) ? layout : createLeafNode(activeThread.id);
      const nextLayout =
        replaceLeafWithSplit(baseLayout, activeThread.id, direction, createLeafNode(openedThread.id)) ??
        baseLayout;

      await persistLayout(nextLayout, openedThread.id);
      startTransition(() => {
        setActiveView("terminal");
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleSplitWithExistingThread = async (threadId: string, direction: SplitDirection) => {
    if (!activeThread || threadId === activeThread.id) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      const baseLayout = hasThreadInLayout(layout, activeThread.id) ? layout : createLeafNode(activeThread.id);
      const layoutWithoutTarget = removeThreadFromLayout(baseLayout, threadId);
      const nextLayout =
        replaceLeafWithSplit(
          layoutWithoutTarget ?? createLeafNode(activeThread.id),
          activeThread.id,
          direction,
          createLeafNode(threadId)
        ) ?? layoutWithoutTarget;

      await persistLayout(nextLayout, threadId);
      startTransition(() => {
        setActiveView("terminal");
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleCloseActivePane = async () => {
    const desktop = window.desktop;

    if (!desktop || !activeThreadId) {
      return;
    }

    const threadToClose = threads.find((thread) => thread.id === activeThreadId) ?? null;

    if (!threadToClose) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      if (threadToClose.status === "running") {
        await desktop.threads.close(threadToClose.id);
      }

      const nextLayout = removeThreadFromLayout(
        hasThreadInLayout(layout, threadToClose.id) ? layout : createLeafNode(threadToClose.id),
        threadToClose.id
      );
      const nextActiveThreadId = getFirstThreadId(nextLayout);

      startTransition(() => {
        setThreads((currentThreads) =>
          currentThreads.map((thread) =>
            thread.id === threadToClose.id
              ? { ...thread, status: "closed", updatedAt: new Date().toISOString() }
              : thread
          )
        );
      });

      await persistLayout(nextLayout, nextActiveThreadId);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  };

  const handleCheckForUpdates = async () => {
    setIsCheckingUpdates(true);
    setUpdateMessage(null);
    setUpdateDownloadUrl(null);

    try {
      const latestRelease = await fetchLatestRelease(UPDATE_REPOSITORY);
      const currentVersion = normalizeVersionLabel(APP_VERSION);
      const latestVersion = normalizeVersionLabel(latestRelease.tagName);
      const comparison = compareVersions(currentVersion, latestVersion);

      if (comparison < 0) {
        setUpdateMessage(`Nova versão disponível: ${latestVersion} (atual: ${currentVersion}).`);
        setUpdateDownloadUrl(latestRelease.htmlUrl);
        return;
      }

      setUpdateMessage(`Você já está na versão mais recente (${currentVersion}).`);
    } catch (error) {
      setUpdateMessage(getErrorMessage(error, "Não foi possível verificar atualizações agora."));
    } finally {
      setIsCheckingUpdates(false);
    }
  };

  const renderLayoutNode = (node: WorkspaceLayoutNode) => {
    if (node.type === "split") {
      const containerClassName =
        node.direction === "vertical"
          ? "flex min-h-0 flex-1 flex-row"
          : "flex min-h-0 flex-1 flex-col";
      const dividerClassName =
        node.direction === "vertical" ? "w-px self-stretch bg-slate-800/90" : "h-px w-full bg-slate-800/90";

      return (
        <div className={`${containerClassName} h-full min-h-0 min-w-0 w-full overflow-hidden`}>
          <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 overflow-hidden">{renderLayoutNode(node.first)}</div>
          <div className={dividerClassName} />
          <div className="flex h-full min-h-0 min-w-0 flex-1 basis-0 overflow-hidden">{renderLayoutNode(node.second)}</div>
        </div>
      );
    }

    const thread = threadById.get(node.threadId) ?? null;

    if (!thread) {
      return <div className="min-h-0 flex-1 bg-slate-950" />;
    }

    const isActive = thread.id === activeThreadId;
    const buffer = terminalBuffersRef.current[thread.id] ?? "";

    return (
      <div
        key={thread.id}
        className={`relative flex size-full min-h-0 min-w-0 flex-1 basis-0 flex-col overflow-hidden border ${
          isActive ? "border-cyan-400/50" : "border-slate-800/80"
        } bg-slate-950/90`}
        onMouseDown={() => {
          if (!isActive) {
            void focusThread(thread.id, layout);
          }
        }}
      >
        <div className="flex min-w-0 items-center justify-between gap-2 border-b border-slate-800/80 bg-slate-950/95 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-100">{thread.title}</p>
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{thread.status}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-slate-300 hover:bg-slate-900 hover:text-white"
              onClick={() => void handleSplitActiveThread("vertical")}
              disabled={isBusy || !isActive}
              aria-label="Split vertical"
              title="Split vertical"
            >
              <span className="text-[10px] font-semibold">V</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-slate-300 hover:bg-slate-900 hover:text-white"
              onClick={() => void handleSplitActiveThread("horizontal")}
              disabled={isBusy || !isActive}
              aria-label="Split horizontal"
              title="Split horizontal"
            >
              <span className="text-[10px] font-semibold">H</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-slate-300 hover:bg-slate-900 hover:text-white"
              onClick={() => void handleCloseActivePane()}
              disabled={isBusy || !isActive}
              aria-label="Close pane"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
        <div className="relative flex min-h-0 min-w-0 flex-1">
          <TerminalPane
            threadId={thread.id}
            initialData={buffer}
            status={thread.status}
            isActive={isActive}
            onFocus={() => void focusThread(thread.id, layout)}
          />
          {thread.status !== "running" ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/72 backdrop-blur-sm">
              <div className="max-w-sm rounded-2xl border border-slate-700/70 bg-slate-950/95 p-6 text-center shadow-xl">
                <p className="text-sm font-medium text-white">
                  This session is currently {threadStatusLabel[thread.status].toLowerCase()}.
                </p>
                <p className="mt-2 text-sm text-slate-300">
                  Reconnect it to resume working in the same project directory.
                </p>
                <Button className="mt-4" onClick={() => void handleOpenThread(thread.id)}>
                  <Plus className="size-4" />
                  Reconnect terminal
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <TooltipProvider>
      <SidebarProvider className="h-dvh max-h-dvh overflow-hidden">
        <AppSidebar
          projects={projects}
          groups={groups}
          threads={threads}
          activeThreadId={activeThreadId}
          activeView={activeView}
          hasMacWindowControlsInset={runtime?.platform === "darwin"}
          busy={isBusy}
          splitThreadIds={splitThreadIds}
          onAddProject={handleAddProject}
          onCreateGroup={handleCreateGroup}
          onRenameGroup={handleRenameGroup}
          onRemoveGroup={handleRemoveGroup}
          onMoveProjectToGroup={handleMoveProjectToGroup}
          onCreateThread={handleCreateThread}
          onSelectThread={handleSelectThread}
          onOpenThread={handleOpenThread}
          onCloseThread={handleCloseThread}
          onClosePane={handleCloseActivePane}
          onOpenSettings={() => setActiveView("settings")}
          onRemoveProject={handleRemoveProject}
          onRemoveThread={handleRemoveThread}
          onRenameThread={handleRenameThread}
          onSplitThreadWithNew={handleSplitActiveThread}
          onSplitThreadWithActive={handleSplitWithExistingThread}
        />
        <SidebarInset className="h-dvh max-h-dvh overflow-hidden md:peer-data-[variant=inset]:my-0">
        <div
          className={
            activeView === "terminal"
              ? "flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent text-slate-100"
              : "flex min-h-0 flex-1 flex-col gap-4 overflow-hidden bg-transparent p-4 pt-4 text-slate-100"
          }
        >
          {isLoading ? (
            <Card className="workspace-panel flex min-h-[320px] flex-1 items-center justify-center text-slate-100">
              <CardContent className="flex items-center gap-3 p-8">
                <LoaderCircle className="size-5 animate-spin text-cyan-300" />
                <span>Loading workspace…</span>
              </CardContent>
            </Card>
          ) : activeView === "settings" ? (
            <Card className="workspace-muted-panel text-slate-100">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MonitorCog className="size-5 text-cyan-300" />
                  Settings
                </CardTitle>
                <CardDescription className="text-slate-300">
                  Local runtime information and app preferences.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-xl border border-slate-800/80 bg-slate-950/45 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Version</p>
                  <p className="mt-2 text-sm text-slate-100">{APP_VERSION}</p>
                </div>
                <div className="rounded-xl border border-slate-800/80 bg-slate-950/45 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Updates</p>
                  <p className="mt-2 text-sm text-slate-100">
                    Verifique se existe uma nova versão publicada para instalação.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button type="button" onClick={() => void handleCheckForUpdates()} disabled={isCheckingUpdates}>
                      {isCheckingUpdates ? "Verificando..." : "Verificar atualização"}
                    </Button>
                    {updateDownloadUrl ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void openExternalLink(updateDownloadUrl)}
                      >
                        Baixar atualização
                      </Button>
                    ) : null}
                  </div>
                  {updateMessage ? (
                    <p className="mt-3 text-sm text-slate-300">{updateMessage}</p>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500">
                      Origem: github.com/{UPDATE_REPOSITORY}
                    </p>
                  )}
                </div>
                <div className="rounded-xl border border-slate-800/80 bg-slate-950/45 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Runtime</p>
                  <p className="mt-2 text-sm text-slate-100">{getRuntimeSubtitle(runtimeInfo, runtime)}</p>
                </div>
              </CardContent>
            </Card>
          ) : projects.length === 0 ? (
            <Card className="workspace-muted-panel m-4 text-slate-100">
              <CardHeader>
                <CardTitle>No projects yet</CardTitle>
                <CardDescription className="max-w-2xl text-slate-300">
                  Add your first project folder to start creating terminal threads bound to that directory.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => void handleAddProject()} disabled={isBusy}>
                  <FolderPlus className="size-4" />
                  Add first project
                </Button>
              </CardContent>
            </Card>
          ) : !layout ? (
            <Card className="workspace-muted-panel m-4 text-slate-100">
              <CardHeader>
                <CardTitle>Select a thread</CardTitle>
                <CardDescription className="max-w-2xl text-slate-300">
                  Select a terminal from the sidebar or create a new one to open it in the workspace.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <Card className="workspace-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-none py-0 text-slate-100">
              <CardContent className="relative flex min-h-0 flex-1 flex-col p-0">{renderLayoutNode(layout)}</CardContent>
            </Card>
          )}
        </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

function mergeProjects(currentProjects: Project[], changedProjects: Project[]) {
  if (changedProjects.length === 0) {
    return currentProjects;
  }

  const changedById = new Map(changedProjects.map((project) => [project.id, project]));
  const mergedProjects = currentProjects.map((project) => changedById.get(project.id) ?? project);
  const knownProjectIds = new Set(mergedProjects.map((project) => project.id));
  for (const project of changedProjects) {
    if (!knownProjectIds.has(project.id)) {
      mergedProjects.push(project);
      knownProjectIds.add(project.id);
    }
  }

  return mergedProjects;
}

function formatBatchAddSummary(
  result: ProjectBatchCreateResult,
  targetGroupId: string | null,
  groupById: Map<string, ProjectGroup>
) {
  const parts: string[] = [];

  if (result.added.length > 0) {
    parts.push(`${result.added.length} novo(s)`);
  }
  if (result.moved.length > 0) {
    parts.push(`${result.moved.length} movido(s)`);
  }
  if (result.existing.length > 0) {
    parts.push(`${result.existing.length} já existente(s)`);
  }

  const targetGroup = targetGroupId ? groupById.get(targetGroupId) : undefined;
  const targetLabel = targetGroup ? ` no grupo "${targetGroup.name}"` : "";

  if (parts.length === 0) {
    return `Nenhum projeto foi alterado${targetLabel}.`;
  }

  return `${parts.join(" · ")}${targetLabel}.`;
}

function getErrorMessage(error: unknown, fallback = "Unexpected error while talking to Electron.") {
  if (error instanceof Error) {
    if (error.message === "PROJECT_EXISTS") {
      return "This folder is already registered as a project.";
    }

    if (error.message.includes("No handler registered for 'threads:rename'")) {
      return "The Electron main process is outdated. Quit and reopen the app to load the latest terminal rename handler.";
    }

    return error.message;
  }

  return fallback;
}

function getRuntimeSubtitle(
  runtimeInfo: ReturnType<typeof getRuntimeInfo>,
  runtime = runtimeInfo.runtime
) {
  if (runtime) {
    return `${runtime.platform} · Electron ${runtime.versions.electron}`;
  }

  if (runtimeInfo.isDesktopApp && !runtimeInfo.hasDesktopBridge) {
    return "Electron desktop · bridge indisponivel";
  }

  if (runtimeInfo.isDesktopApp) {
    return "Electron desktop";
  }

  return "Web browser";
}

interface GithubReleasePayload {
  tag_name: string;
  html_url: string;
}

interface LatestRelease {
  tagName: string;
  htmlUrl: string;
}

async function fetchLatestRelease(repository: string): Promise<LatestRelease> {
  const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
    headers: {
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    throw new Error("Falha ao consultar release mais recente.");
  }

  const payload = (await response.json()) as GithubReleasePayload;

  if (!payload.tag_name || !payload.html_url) {
    throw new Error("Resposta de release inválida.");
  }

  return {
    tagName: payload.tag_name,
    htmlUrl: payload.html_url,
  };
}

function normalizeVersionLabel(version: string) {
  return version.trim().replace(/^v/i, "");
}

function compareVersions(currentVersion: string, targetVersion: string) {
  const currentParts = parseVersionParts(currentVersion);
  const targetParts = parseVersionParts(targetVersion);
  const maxLength = Math.max(currentParts.length, targetParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const currentPart = currentParts[index] ?? 0;
    const targetPart = targetParts[index] ?? 0;

    if (currentPart < targetPart) {
      return -1;
    }
    if (currentPart > targetPart) {
      return 1;
    }
  }

  return 0;
}

function parseVersionParts(version: string) {
  const parts = version.split(".").map((part) => Number.parseInt(part, 10));
  const hasInvalidPart = parts.some((part) => Number.isNaN(part));

  if (hasInvalidPart) {
    throw new Error(`Versão inválida: ${version}`);
  }

  return parts;
}

function openExternalLink(url: string) {
  const desktop = window.desktop;

  if (desktop) {
    return desktop.openExternal(url);
  }

  window.open(url, "_blank", "noopener,noreferrer");
  return Promise.resolve();
}

const threadStatusLabel: Record<ThreadStatus, string> = {
  idle: "Idle",
  running: "Running",
  closed: "Closed",
  errored: "Errored",
};


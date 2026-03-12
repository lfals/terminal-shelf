"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, FolderPlus, LoaderCircle, MonitorCog, Plus } from "lucide-react";

import { AppSidebar } from "@/components/app-sidebar";
import { TerminalPane } from "@/components/terminal/terminal-pane";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { getRuntimeInfo } from "@/lib/runtime";
import type { Project, Thread, ThreadStatus, WorkspaceSnapshot } from "@/lib/workspace-types";

const MAX_BUFFER_SIZE = 200_000;
type MainView = "terminal" | "settings";

const trimBuffer = (value: string) =>
  value.length > MAX_BUFFER_SIZE ? value.slice(value.length - MAX_BUFFER_SIZE) : value;

const updateThread = (threads: Thread[], nextThread: Thread) =>
  threads.map((thread) => (thread.id === nextThread.id ? nextThread : thread));

export function WorkspaceShell() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<MainView>("terminal");
  const [runtimeInfo, setRuntimeInfo] = useState(() => getRuntimeInfo(undefined));
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const terminalBuffersRef = useRef<Record<string, string>>({});

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? null,
    [activeThreadId, threads]
  );
  const runtime = runtimeInfo.runtime;
  const activeProject = useMemo(
    () =>
      activeThread
        ? projects.find((project) => project.id === activeThread.projectId) ?? null
        : null,
    [activeThread, projects]
  );
  const activeBuffer = activeThreadId ? terminalBuffersRef.current[activeThreadId] ?? "" : "";

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

    const applySnapshot = (snapshot: WorkspaceSnapshot) => {
      startTransition(() => {
        setProjects(snapshot.projects);
        setThreads(snapshot.threads);
        setActiveThreadId(snapshot.activeThreadId);
      });
    };

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

  const handleAddProject = async () => {
    const desktop = window.desktop;

    if (!desktop) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      const project = await desktop.projects.create();

      if (!project) {
        return;
      }

      startTransition(() => {
        setProjects((currentProjects) => [...currentProjects, project]);
      });
    } catch (error) {
      setErrorMessage(
        getErrorMessage(error, "Não foi possível adicionar o projeto. Verifique se a pasta já existe na lista.")
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

      startTransition(() => {
        setProjects((currentProjects) => currentProjects.filter((project) => project.id !== projectId));
        setThreads((currentThreads) =>
          currentThreads.filter((thread) => thread.projectId !== projectId)
        );
        setActiveThreadId((currentActiveThreadId) =>
          currentActiveThreadId && removedThreadIds.has(currentActiveThreadId)
            ? null
            : currentActiveThreadId
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
        setActiveThreadId(thread.id);
        setActiveView("terminal");
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  };

  const handleSelectThread = (threadId: string) => {
    setErrorMessage(null);
    startTransition(() => {
      setActiveThreadId(threadId);
      setActiveView("terminal");
    });
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

      startTransition(() => {
        setThreads((currentThreads) => currentThreads.filter((thread) => thread.id !== threadId));
        setActiveThreadId((currentActiveThreadId) =>
          currentActiveThreadId === threadId ? null : currentActiveThreadId
        );
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

  const breadcrumbLabel = activeView === "settings" ? "Workspace" : activeProject?.name ?? "Workspace";
  const breadcrumbDetail = activeView === "settings" ? "Settings" : activeThread?.title ?? "Select a terminal";

  return (
    <SidebarProvider>
      <AppSidebar
        projects={projects}
        threads={threads}
        activeThreadId={activeThreadId}
        activeView={activeView}
        hasMacWindowControlsInset={ runtime?.platform === "darwin"}
        busy={isBusy}
        onAddProject={handleAddProject}
        onCreateThread={handleCreateThread}
        onSelectThread={handleSelectThread}
        onOpenThread={handleOpenThread}
        onCloseThread={handleCloseThread}
        onOpenSettings={() => setActiveView("settings")}
        onRemoveProject={handleRemoveProject}
        onRemoveThread={handleRemoveThread}
        onRenameThread={handleRenameThread}
      />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-slate-800/80 bg-slate-950/70 text-slate-100 backdrop-blur-xl transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex min-w-0 flex-1 items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 bg-slate-700 data-[orientation=vertical]:h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbPage>{breadcrumbLabel}</BreadcrumbPage>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>{breadcrumbDetail}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <div className="flex items-center gap-2 px-4">
            {activeThread && activeView === "terminal" ? (
              <Badge className={`${statusBadgeClassName(activeThread.status)} hidden md:inline-flex`}>
                {threadStatusLabel[activeThread.status]}
              </Badge>
            ) : null}
          </div>
        </header>
        <div
          className={
            activeThread && activeView === "terminal"
              ? "flex flex-1 flex-col bg-transparent text-slate-100"
              : "flex flex-1 flex-col gap-4 bg-transparent p-4 pt-4 text-slate-100"
          }
        >
          {errorMessage ? (
            <Alert variant="destructive" className="border-rose-500/25 bg-rose-950/45 text-rose-100">
              <AlertCircle className="size-4" />
              <AlertTitle>Workspace error</AlertTitle>
              <AlertDescription className="text-rose-100/85">{errorMessage}</AlertDescription>
            </Alert>
          ) : null}

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
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Runtime</p>
                  <p className="mt-2 text-sm text-slate-100">{getRuntimeSubtitle(runtimeInfo, runtime)}</p>
                </div>
              </CardContent>
            </Card>
          ) : projects.length === 0 ? (
            <Card className="workspace-muted-panel text-slate-100">
              <CardHeader>
                <CardTitle>No projects yet</CardTitle>
                <CardDescription className="max-w-2xl text-slate-300">
                  Add your first project folder to start creating terminal threads bound to that directory.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={handleAddProject} disabled={isBusy}>
                  <FolderPlus className="size-4" />
                  Add first project
                </Button>
              </CardContent>
            </Card>
          ) : !activeThread ? (
            <Card className="workspace-muted-panel text-slate-100">
              <CardHeader>
                <CardTitle>Select a thread</CardTitle>
                <CardDescription className="max-w-2xl text-slate-300">
                  Create a terminal from the project menu to start working in one of your project directories.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <Card className="workspace-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-none text-slate-100">
              <CardContent className="relative flex min-h-0 flex-1 flex-col p-0">
                <TerminalPane
                  threadId={activeThread.id}
                  initialData={activeBuffer}
                  status={activeThread.status}
                />
                {activeThread.status !== "running" ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-950/72 backdrop-blur-sm">
                    <div className="max-w-sm rounded-2xl border border-slate-700/70 bg-slate-950/95 p-6 text-center shadow-xl">
                      <p className="text-sm font-medium text-white">
                        This session is currently {threadStatusLabel[activeThread.status].toLowerCase()}.
                      </p>
                      <p className="mt-2 text-sm text-slate-300">
                        Reconnect it to resume working in the same project directory.
                      </p>
                      <Button className="mt-4" onClick={() => handleOpenThread(activeThread.id)}>
                        <Plus className="size-4" />
                        Reconnect terminal
                      </Button>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
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
    return `${runtime.platform} · Electron ${runtime.versions.electron}`
  }

  if (runtimeInfo.isDesktopApp && !runtimeInfo.hasDesktopBridge) {
    return "Electron desktop · bridge indisponivel"
  }

  if (runtimeInfo.isDesktopApp) {
    return "Electron desktop"
  }

  return "Web browser"
}

const threadStatusLabel: Record<ThreadStatus, string> = {
  idle: "Idle",
  running: "Running",
  closed: "Closed",
  errored: "Errored",
};

function statusBadgeClassName(status: ThreadStatus) {
  if (status === "running") {
    return "border-emerald-400/30 bg-emerald-500/15 text-emerald-200";
  }

  if (status === "errored") {
    return "border-rose-400/30 bg-rose-500/15 text-rose-200";
  }

  return "border-slate-700/80 bg-slate-800/80 text-slate-200";
}

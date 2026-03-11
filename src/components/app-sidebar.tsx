"use client"

import * as React from "react"
import { GalleryVerticalEnd, MonitorCog, PanelTop, SquareTerminal } from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavProjects } from "@/components/nav-projects"
import { NavUser } from "@/components/nav-user"
import { TeamSwitcher } from "@/components/team-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"
import type { DesktopRuntime } from "@/lib/runtime"
import type { Project, Thread } from "@/lib/workspace-types"

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  projects: Project[]
  threads: Thread[]
  recentThreads: Thread[]
  activeThreadId: string | null
  activeView: "workspace" | "settings"
  isDesktopApp?: boolean
  hasDesktopBridge?: boolean
  runtime?: DesktopRuntime
  busy?: boolean
  onAddProject: () => void
  onCreateThread: (projectId: string) => void
  onOpenThread: (threadId: string) => void
  onRemoveProject: (projectId: string) => void
  onRemoveThread: (threadId: string) => void
  onSelectView: (view: "workspace" | "settings") => void
}

export function AppSidebar({
  projects,
  threads,
  recentThreads,
  activeThreadId,
  activeView,
  isDesktopApp = false,
  hasDesktopBridge = false,
  runtime,
  busy = false,
  onAddProject,
  onCreateThread,
  onOpenThread,
  onRemoveProject,
  onRemoveThread,
  onSelectView,
  ...props
}: AppSidebarProps) {
  const navMain = [
    {
      title: "Workspace",
      icon: PanelTop,
      isActive: activeView === "workspace",
      onSelect: () => onSelectView("workspace"),
    },
    {
      title: "Recent",
      icon: SquareTerminal,
      isActive: activeView === "workspace" && recentThreads.some((thread) => thread.id === activeThreadId),
      items:
        recentThreads.length > 0
          ? recentThreads.map((thread) => ({
              title: thread.title,
              isActive: thread.id === activeThreadId,
              onSelect: () => onOpenThread(thread.id),
            }))
          : [
              {
                title: "No recent threads",
              },
            ],
    },
    {
      title: "Settings",
      icon: MonitorCog,
      isActive: activeView === "settings",
      onSelect: () => onSelectView("settings"),
    },
  ]

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher
          label="Term"
          description={`${projects.length} projects · ${threads.length} threads`}
          busy={busy}
          onAddProject={onAddProject}
        />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        <NavProjects
          projects={projects}
          threads={threads}
          activeThreadId={activeThreadId}
          busy={busy}
          onAddProject={onAddProject}
          onCreateThread={onCreateThread}
          onOpenThread={onOpenThread}
          onRemoveProject={onRemoveProject}
          onRemoveThread={onRemoveThread}
        />
      </SidebarContent>
      <SidebarFooter>
        <NavUser
          name="Local Workspace"
          subtitle={getRuntimeSubtitle({ isDesktopApp, hasDesktopBridge, runtime })}
          icon={GalleryVerticalEnd}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function getRuntimeSubtitle({
  isDesktopApp,
  hasDesktopBridge,
  runtime,
}: {
  isDesktopApp: boolean
  hasDesktopBridge: boolean
  runtime?: DesktopRuntime
}) {
  if (runtime) {
    return `${runtime.platform} · Electron ${runtime.versions.electron}`
  }

  if (isDesktopApp && !hasDesktopBridge) {
    return "Electron desktop · bridge indisponivel"
  }

  if (isDesktopApp) {
    return "Electron desktop"
  }

  return "Web browser"
}

"use client"

import * as React from "react"
import { GalleryVerticalEnd } from "lucide-react"

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
  activeThreadId: string | null
  isDesktopApp?: boolean
  hasDesktopBridge?: boolean
  runtime?: DesktopRuntime
  busy?: boolean
  onAddProject: () => void
  onCreateThread: (projectId: string) => void
  onOpenThread: (threadId: string) => void
  onRemoveProject: (projectId: string) => void
  onRemoveThread: (threadId: string) => void
}

export function AppSidebar({
  projects,
  threads,
  activeThreadId,
  isDesktopApp = false,
  hasDesktopBridge = false,
  runtime,
  busy = false,
  onAddProject,
  onCreateThread,
  onOpenThread,
  onRemoveProject,
  onRemoveThread,
  ...props
}: AppSidebarProps) {
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

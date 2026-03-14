"use client"

import * as React from "react"
import { MonitorCog } from "lucide-react"

import { NavProjects } from "@/components/nav-projects"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import type { Project, SplitDirection, Thread } from "@/lib/workspace-types"

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  projects: Project[]
  threads: Thread[]
  activeThreadId: string | null
  activeView: "terminal" | "settings"
  hasMacWindowControlsInset?: boolean
  busy?: boolean
  splitThreadIds: Set<string>
  onAddProject: () => void
  onCreateThread: (projectId: string) => void
  onClosePane: () => void
  onSelectThread: (threadId: string) => void
  onOpenThread: (threadId: string) => void
  onCloseThread: (threadId: string) => void
  onOpenSettings: () => void
  onRemoveProject: (projectId: string) => void
  onRemoveThread: (threadId: string) => void
  onRenameThread: (threadId: string, title: string) => void
  onSplitThreadWithNew: (direction: SplitDirection) => void
  onSplitThreadWithActive: (threadId: string, direction: SplitDirection) => void
}

export function AppSidebar({
  projects,
  threads,
  activeThreadId,
  activeView,
  busy = false,
  splitThreadIds,
  onAddProject,
  onCreateThread,
  onClosePane,
  onSelectThread,
  onOpenThread,
  onCloseThread,
  onOpenSettings,
  onRemoveProject,
  onRemoveThread,
  onRenameThread,
  onSplitThreadWithNew,
  onSplitThreadWithActive,
  ...props
}: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarContent>
        <NavProjects
          projects={projects}
          threads={threads}
          activeThreadId={activeThreadId}
          busy={busy}
          splitThreadIds={splitThreadIds}
          onAddProject={onAddProject}
          onCreateThread={onCreateThread}
          onClosePane={onClosePane}
          onSelectThread={onSelectThread}
          onOpenThread={onOpenThread}
          onCloseThread={onCloseThread}
          onRemoveProject={onRemoveProject}
          onRemoveThread={onRemoveThread}
          onRenameThread={onRenameThread}
          onSplitThreadWithNew={onSplitThreadWithNew}
          onSplitThreadWithActive={onSplitThreadWithActive}
        />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Settings"
              isActive={activeView === "settings"}
              onClick={onOpenSettings}
              className="text-slate-300 hover:bg-slate-900/55 hover:text-white data-[active=true]:bg-slate-900/80 data-[active=true]:text-white"
            >
              <MonitorCog />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

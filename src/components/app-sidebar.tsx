"use client"

import * as React from "react"
import { MonitorCog } from "lucide-react"

import { NavProjects } from "@/components/nav-projects"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import type { Project, Thread } from "@/lib/workspace-types"
import { TeamSwitcher } from "./team-switcher"

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  projects: Project[]
  threads: Thread[]
  activeThreadId: string | null
  activeView: "terminal" | "settings"
  hasMacWindowControlsInset?: boolean
  busy?: boolean
  onAddProject: () => void
  onCreateThread: (projectId: string) => void
  onSelectThread: (threadId: string) => void
  onOpenThread: (threadId: string) => void
  onCloseThread: (threadId: string) => void
  onOpenSettings: () => void
  onRemoveProject: (projectId: string) => void
  onRemoveThread: (threadId: string) => void
  onRenameThread: (threadId: string, title: string) => void
}

export function AppSidebar({
  projects,
  threads,
  activeThreadId,
  activeView,
  hasMacWindowControlsInset,
  busy = false,
  onAddProject,
  onCreateThread,
  onSelectThread,
  onOpenThread,
  onCloseThread,
  onOpenSettings,
  onRemoveProject,
  onRemoveThread,
  onRenameThread,
  ...props
}: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader
        className={cn(
          "app-sidebar-header drag-region h-[52px] flex-row items-center gap-2 px-4 py-0",
          hasMacWindowControlsInset && "pl-20"
        )}
      >
        <TeamSwitcher label="Term" />
      </SidebarHeader>
      <SidebarContent>
        <NavProjects
          projects={projects}
          threads={threads}
          activeThreadId={activeThreadId}
          busy={busy}
          onAddProject={onAddProject}
          onCreateThread={onCreateThread}
          onSelectThread={onSelectThread}
          onOpenThread={onOpenThread}
          onCloseThread={onCloseThread}
          onRemoveProject={onRemoveProject}
          onRemoveThread={onRemoveThread}
          onRenameThread={onRenameThread}
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

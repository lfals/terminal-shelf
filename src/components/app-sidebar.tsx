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
import { cn } from "@/lib/utils"
import type { Project, ProjectGroup, SplitDirection, Thread } from "@/lib/workspace-types"

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  projects: Project[]
  groups: ProjectGroup[]
  threads: Thread[]
  activeThreadId: string | null
  activeView: "terminal" | "settings"
  hasMacWindowControlsInset?: boolean
  busy?: boolean
  splitThreadIds: Set<string>
  onAddProject: (groupId?: string | null) => void
  onCreateGroup: (name: string) => void
  onRenameGroup: (groupId: string, name: string) => void
  onRemoveGroup: (groupId: string, removeProjects: boolean) => void
  onMoveProjectToGroup: (projectId: string, groupId: string | null) => void
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
  groups,
  threads,
  activeThreadId,
  activeView,
  hasMacWindowControlsInset = false,
  busy = false,
  splitThreadIds,
  onAddProject,
  onCreateGroup,
  onRenameGroup,
  onRemoveGroup,
  onMoveProjectToGroup,
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
  className,
  ...sidebarProps
}: AppSidebarProps) {
  return (
    <Sidebar
      collapsible="none"
      className={cn(
        "border-r border-slate-700/40 bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900/98 text-slate-200 shadow-[inset_-1px_0_0_rgb(148_163_184/0.06)]",
        className
      )}
      {...sidebarProps}
    >
      <SidebarContent
        className={cn(
          "pt-5",
          hasMacWindowControlsInset && "pt-12"
        )}
      >
        <NavProjects
          projects={projects}
          groups={groups}
          threads={threads}
          activeThreadId={activeThreadId}
          busy={busy}
          splitThreadIds={splitThreadIds}
          onAddProject={onAddProject}
          onCreateGroup={onCreateGroup}
          onRenameGroup={onRenameGroup}
          onRemoveGroup={onRemoveGroup}
          onMoveProjectToGroup={onMoveProjectToGroup}
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
      <SidebarFooter className="border-t border-slate-800/60 bg-slate-950/40">
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

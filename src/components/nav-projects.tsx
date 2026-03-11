"use client"

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar"
import type { Project, Thread } from "@/lib/workspace-types"
import { ChevronRight, Folder, FolderPlus, MoreHorizontal, Plus, SquareTerminal, Trash2 } from "lucide-react"

interface NavProjectsProps {
  projects: Project[]
  threads: Thread[]
  activeThreadId: string | null
  busy?: boolean
  onAddProject: () => void
  onCreateThread: (projectId: string) => void
  onOpenThread: (threadId: string) => void
  onRemoveProject: (projectId: string) => void
  onRemoveThread: (threadId: string) => void
}

export function NavProjects({
  projects,
  threads,
  activeThreadId,
  busy = false,
  onAddProject,
  onCreateThread,
  onOpenThread,
  onRemoveProject,
  onRemoveThread,
}: NavProjectsProps) {
  const { isMobile } = useSidebar()

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel className="flex items-center justify-between">
        <span>Projects</span>
        <button
          type="button"
          className="rounded-md p-1 text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={onAddProject}
          disabled={busy}
          aria-label="Add project"
        >
          <FolderPlus className="size-4" />
        </button>
      </SidebarGroupLabel>
      <SidebarMenu>
        {projects.map((project) => {
          const projectThreads = threads.filter((thread) => thread.projectId === project.id)
          const isProjectActive = projectThreads.some((thread) => thread.id === activeThreadId)

          return (
            <Collapsible
              key={project.id}
              asChild
              defaultOpen={isProjectActive}
              className="group/collapsible"
            >
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton tooltip={project.name} isActive={isProjectActive}>
                    <Folder />
                    <span className="truncate">{project.name}</span>
                    <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <div className="flex items-center">
                  <SidebarMenuAction
                    showOnHover
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      onCreateThread(project.id)
                    }}
                  >
                    <Plus />
                    <span className="sr-only">Create thread</span>
                  </SidebarMenuAction>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuAction showOnHover>
                        <MoreHorizontal />
                        <span className="sr-only">Project actions</span>
                      </SidebarMenuAction>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      className="w-48 rounded-lg"
                      side={isMobile ? "bottom" : "right"}
                      align={isMobile ? "end" : "start"}
                    >
                      <DropdownMenuItem onClick={() => onCreateThread(project.id)}>
                        <Plus className="text-muted-foreground" />
                        <span>New terminal</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onRemoveProject(project.id)}>
                        <Trash2 className="text-muted-foreground" />
                        <span>Remove project</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {projectThreads.length === 0 ? (
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton onClick={() => onCreateThread(project.id)}>
                          <span>Create first terminal</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ) : (
                      projectThreads.map((thread) => (
                        <SidebarMenuSubItem key={thread.id} className="group/subitem relative">
                          <SidebarMenuSubButton
                            isActive={thread.id === activeThreadId}
                            onClick={() => onOpenThread(thread.id)}
                            className="justify-between"
                          >
                            <span className="truncate">{thread.title}</span>
                            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                              {thread.status}
                            </span>
                          </SidebarMenuSubButton>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground opacity-0 transition group-hover/subitem:opacity-100 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                                onClick={(event) => event.stopPropagation()}
                                aria-label="Thread actions"
                              >
                                <MoreHorizontal className="size-3.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              className="w-44 rounded-lg"
                              side={isMobile ? "bottom" : "right"}
                              align={isMobile ? "end" : "start"}
                            >
                              <DropdownMenuItem onClick={() => onOpenThread(thread.id)}>
                                <SquareTerminal className="text-muted-foreground" />
                                <span>Open thread</span>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => onRemoveThread(thread.id)}>
                                <Trash2 className="text-muted-foreground" />
                                <span>Remove thread</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </SidebarMenuSubItem>
                      ))
                    )}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          )
        })}
        <SidebarMenuItem>
          <SidebarMenuButton onClick={onAddProject} className="text-sidebar-foreground/80">
            <FolderPlus className="text-sidebar-foreground/70" />
            <span>Add project</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  )
}

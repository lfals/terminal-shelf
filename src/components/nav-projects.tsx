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
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar"
import type { Project, Thread } from "@/lib/workspace-types"
import { ChevronRight, FolderPlus, MoreHorizontal, Plus, SquareTerminal, Trash2 } from "lucide-react"

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
              <SidebarMenuItem className="rounded-md transition-colors hover:bg-slate-900/55">
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton
                    tooltip={project.name}
                    className="rounded-md text-slate-200 hover:bg-transparent hover:text-white group-hover/menu-item:text-white"
                  >
                    <ChevronRight className="transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    <span className="truncate">{project.name}</span>
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <div className="flex items-center">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform group-hover/menu-item:text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 md:opacity-0 group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 aria-expanded:opacity-100"
                        onClick={(event) => event.stopPropagation()}
                        aria-label="Project actions"
                      >
                        <MoreHorizontal />
                        <span className="sr-only">Project actions</span>
                      </button>
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
                            className="group/thread-button justify-between rounded-md border border-transparent pr-10 text-slate-300 hover:bg-slate-900/55 hover:text-slate-100 data-[active=true]:border-transparent data-[active=true]:bg-slate-800/95 data-[active=true]:text-white"
                          >
                            <span className="truncate">{thread.title}</span>
                            <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500 group-data-[active=true]/thread-button:text-cyan-100/75">
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
      </SidebarMenu>
    </SidebarGroup>
  )
}

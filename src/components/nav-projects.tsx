"use client"

import { type FormEvent, useState } from "react"

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
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
import type { Project, ProjectGroup, SplitDirection, Thread } from "@/lib/workspace-types"
import {
  ChevronRight,
  Folder,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Plus,
  SquareTerminal,
  Trash2,
} from "lucide-react"

interface NavProjectsProps {
  projects: Project[]
  groups: ProjectGroup[]
  threads: Thread[]
  activeThreadId: string | null
  busy?: boolean
  splitThreadIds: Set<string>
  onAddProject: (groupId?: string | null) => void
  onCreateGroup: (name: string) => void
  onRenameGroup: (groupId: string, name: string) => void
  onRemoveGroup: (groupId: string) => void
  onMoveProjectToGroup: (projectId: string, groupId: string | null) => void
  onCreateThread: (projectId: string) => void
  onClosePane: () => void
  onSelectThread: (threadId: string) => void
  onOpenThread: (threadId: string) => void
  onCloseThread: (threadId: string) => void
  onRemoveProject: (projectId: string) => void
  onRemoveThread: (threadId: string) => void
  onRenameThread: (threadId: string, title: string) => void
  onSplitThreadWithNew: (direction: SplitDirection) => void
  onSplitThreadWithActive: (threadId: string, direction: SplitDirection) => void
}

type RenameTarget =
  | { kind: "thread"; id: string; lastAutoTitle: string | null }
  | { kind: "group"; id: string; currentName: string }

export function NavProjects({
  projects,
  groups,
  threads,
  activeThreadId,
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
  onRemoveProject,
  onRemoveThread,
  onRenameThread,
  onSplitThreadWithNew,
  onSplitThreadWithActive,
}: NavProjectsProps) {
  const { isMobile } = useSidebar()
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [showNewGroupDialog, setShowNewGroupDialog] = useState(false)
  const [newGroupName, setNewGroupName] = useState("")

  const closeRenameDialog = () => {
    setRenameTarget(null)
    setRenameValue("")
  }

  const handleRenameSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!renameTarget) {
      return
    }

    if (renameTarget.kind === "thread") {
      onRenameThread(renameTarget.id, renameValue)
    } else if (renameValue.trim()) {
      onRenameGroup(renameTarget.id, renameValue)
    }

    closeRenameDialog()
  }

  const handleResetAutomaticTitle = () => {
    if (!renameTarget || renameTarget.kind !== "thread") {
      return
    }

    onRenameThread(renameTarget.id, "")
    closeRenameDialog()
  }

  const closeNewGroupDialog = () => {
    setShowNewGroupDialog(false)
    setNewGroupName("")
  }

  const handleNewGroupSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!newGroupName.trim()) {
      return
    }

    onCreateGroup(newGroupName.trim())
    closeNewGroupDialog()
  }

  const renderProject = (project: Project) => {
    const projectThreads = threads.filter((thread) => thread.projectId === project.id)
    const isProjectActive = projectThreads.some((thread) => thread.id === activeThreadId)
    const groupsForMove = groups.filter((g) => g.id !== project.groupId)
    const canMoveToNoGroup = project.groupId !== null

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
                {(groupsForMove.length > 0 || canMoveToNoGroup) ? (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger disabled={busy}>
                      <Folder className="text-muted-foreground" />
                      <span>Move to group</span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {canMoveToNoGroup ? (
                        <DropdownMenuItem
                          onClick={() => onMoveProjectToGroup(project.id, null)}
                          disabled={busy}
                        >
                          <span>No group</span>
                        </DropdownMenuItem>
                      ) : null}
                      {groupsForMove.map((group) => (
                        <DropdownMenuItem
                          key={group.id}
                          onClick={() => onMoveProjectToGroup(project.id, group.id)}
                          disabled={busy}
                        >
                          <span>{group.name}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                ) : null}
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
                projectThreads.map((thread) => {
                  const isRunning = thread.status === "running"
                  const isActiveThread = thread.id === activeThreadId
                  const canSplitWithActiveThread = Boolean(activeThreadId) && !isActiveThread
                  const primaryThreadActionLabel = isRunning ? "Close terminal" : "Reconnect terminal"
                  const primaryThreadAction = isRunning
                    ? () => onCloseThread(thread.id)
                    : () => onOpenThread(thread.id)

                  return (
                    <SidebarMenuSubItem key={thread.id} className="group/subitem relative">
                      <SidebarMenuSubButton
                        isActive={isActiveThread}
                        onClick={() => onSelectThread(thread.id)}
                        className="group/thread-button justify-between rounded-md border border-transparent pr-10 text-slate-300 hover:bg-slate-900/55 hover:text-slate-100 data-[active=true]:border-transparent data-[active=true]:bg-slate-800/95 data-[active=true]:text-white"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          {splitThreadIds.has(thread.id) ? (
                            <span
                              aria-label="Split terminal"
                              title="Split terminal"
                              className="inline-flex h-3.5 w-3.5 items-center gap-px rounded-[3px] border border-cyan-400/60 p-[2px]"
                            >
                              <span className="h-full flex-1 rounded-[1px] bg-cyan-300/80" />
                              <span className="h-full flex-1 rounded-[1px] bg-cyan-300/35" />
                            </span>
                          ) : null}
                          <span className="truncate">{thread.title}</span>
                        </span>
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
                          <DropdownMenuItem onClick={primaryThreadAction} disabled={busy}>
                            <SquareTerminal className="text-muted-foreground" />
                            <span>{primaryThreadActionLabel}</span>
                          </DropdownMenuItem>
                          {isActiveThread ? (
                            <>
                              <DropdownMenuItem
                                onClick={() => onSplitThreadWithNew("vertical")}
                                disabled={busy}
                              >
                                <span>Split vertical</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => onSplitThreadWithNew("horizontal")}
                                disabled={busy}
                              >
                                <span>Split horizontal</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={onClosePane} disabled={busy}>
                                <span>Close pane</span>
                              </DropdownMenuItem>
                            </>
                          ) : null}
                          {canSplitWithActiveThread ? (
                            <>
                              <DropdownMenuItem
                                onClick={() => onSplitThreadWithActive(thread.id, "vertical")}
                                disabled={busy}
                              >
                                <span>Split vertical with active</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => onSplitThreadWithActive(thread.id, "horizontal")}
                                disabled={busy}
                              >
                                <span>Split horizontal with active</span>
                              </DropdownMenuItem>
                            </>
                          ) : null}
                          <DropdownMenuItem
                            onClick={() =>
                              setRenameTarget({
                                kind: "thread",
                                id: thread.id,
                                lastAutoTitle: thread.lastAutoTitle,
                              })
                            }
                            disabled={busy}
                          >
                            <Pencil className="text-muted-foreground" />
                            <span>Rename terminal</span>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => onRemoveThread(thread.id)} disabled={busy}>
                            <Trash2 className="text-muted-foreground" />
                            <span>Remove thread</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </SidebarMenuSubItem>
                  )
                })
              )}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    )
  }

  const ungroupedProjects = projects.filter((p) => p.groupId === null)

  return (
    <>
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel className="flex items-center justify-between">
          <span>Projects</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="rounded-md p-1 text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              onClick={() => setShowNewGroupDialog(true)}
              disabled={busy}
              aria-label="New group"
              title="New group"
            >
              <Folder className="size-4" />
            </button>
            <button
              type="button"
              className="rounded-md p-1 text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              onClick={() => onAddProject()}
              disabled={busy}
              aria-label="Add project"
              title="Add project"
            >
              <FolderPlus className="size-4" />
            </button>
          </div>
        </SidebarGroupLabel>
        <SidebarMenu>
          {/* Grupos de projetos */}
          {groups.map((group) => {
            const groupProjects = projects.filter((p) => p.groupId === group.id)
            const isGroupActive = groupProjects.some((p) =>
              threads.some((t) => t.projectId === p.id && t.id === activeThreadId)
            )

            return (
              <Collapsible
                key={group.id}
                asChild
                defaultOpen={isGroupActive}
                className="group/group-collapsible"
              >
                <SidebarMenuItem className="group/groupitem rounded-md transition-colors hover:bg-slate-900/55">
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton
                      tooltip={group.name}
                      className="rounded-md text-slate-400 hover:bg-transparent hover:text-slate-200 group-hover/menu-item:text-slate-200"
                    >
                      <Folder className="size-4 shrink-0 text-slate-500" />
                      <span className="truncate">{group.name}</span>
                      <ChevronRight className="ml-auto size-4 transition-transform duration-200 group-data-[state=open]/group-collapsible:rotate-90" />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <div className="flex items-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring outline-hidden transition-transform group-hover/groupitem:text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 md:opacity-0 group-focus-within/groupitem:opacity-100 group-hover/groupitem:opacity-100 aria-expanded:opacity-100"
                          onClick={(event) => event.stopPropagation()}
                          aria-label="Group actions"
                        >
                          <MoreHorizontal />
                          <span className="sr-only">Group actions</span>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        className="w-44 rounded-lg"
                        side={isMobile ? "bottom" : "right"}
                        align={isMobile ? "end" : "start"}
                      >
                        <DropdownMenuItem onClick={() => onAddProject(group.id)} disabled={busy}>
                          <FolderPlus className="text-muted-foreground" />
                          <span>Add project</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            setRenameTarget({
                              kind: "group",
                              id: group.id,
                              currentName: group.name,
                            })
                          }
                          disabled={busy}
                        >
                          <Pencil className="text-muted-foreground" />
                          <span>Rename group</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onRemoveGroup(group.id)} disabled={busy}>
                          <Trash2 className="text-muted-foreground" />
                          <span>Remove group</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {groupProjects.length === 0 ? (
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            className="text-slate-500 italic"
                            onClick={() => onAddProject(group.id)}
                          >
                            <span>Add a project</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ) : (
                        <SidebarMenu>
                          {groupProjects.map((project) => renderProject(project))}
                        </SidebarMenu>
                      )}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </SidebarMenuItem>
              </Collapsible>
            )
          })}

          {/* Projetos sem grupo */}
          {ungroupedProjects.map((project) => renderProject(project))}
        </SidebarMenu>
      </SidebarGroup>

      {/* Dialog: renomear thread ou grupo */}
      <AlertDialog
        open={renameTarget !== null}
        onOpenChange={(open) => !open && closeRenameDialog()}
      >
        <AlertDialogContent size="sm">
          <form onSubmit={handleRenameSubmit} className="space-y-4">
            <AlertDialogHeader>
              <AlertDialogTitle>
                {renameTarget?.kind === "group" ? "Rename group" : "Rename terminal"}
              </AlertDialogTitle>
              {renameTarget?.kind === "thread" ? (
                <AlertDialogDescription>
                  Use a custom name or leave the field empty to restore the latest executed command.
                </AlertDialogDescription>
              ) : (
                <AlertDialogDescription>
                  Enter a new name for this group.
                </AlertDialogDescription>
              )}
            </AlertDialogHeader>
            <Input
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              placeholder={
                renameTarget?.kind === "thread"
                  ? (renameTarget.lastAutoTitle ?? "Enter a name")
                  : (renameTarget?.currentName ?? "Enter a name")
              }
              autoFocus
              maxLength={80}
            />
            <AlertDialogFooter
              className={
                renameTarget?.kind === "thread"
                  ? "grid grid-cols-1 gap-2 sm:grid-cols-3"
                  : "grid grid-cols-1 gap-2 sm:grid-cols-2"
              }
            >
              <Button type="button" variant="outline" onClick={closeRenameDialog} disabled={busy}>
                Cancel
              </Button>
              {renameTarget?.kind === "thread" ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleResetAutomaticTitle}
                  disabled={busy}
                >
                  Auto name
                </Button>
              ) : null}
              <Button type="submit" disabled={busy}>
                Save
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog: criar grupo */}
      <AlertDialog
        open={showNewGroupDialog}
        onOpenChange={(open) => !open && closeNewGroupDialog()}
      >
        <AlertDialogContent size="sm">
          <form onSubmit={handleNewGroupSubmit} className="space-y-4">
            <AlertDialogHeader>
              <AlertDialogTitle>New group</AlertDialogTitle>
              <AlertDialogDescription>
                Choose a name for this project group.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Input
              value={newGroupName}
              onChange={(event) => setNewGroupName(event.target.value)}
              placeholder="e.g. Work, Personal, Client X…"
              autoFocus
              maxLength={80}
            />
            <AlertDialogFooter className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button type="button" variant="outline" onClick={closeNewGroupDialog} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !newGroupName.trim()}>
                Create
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

"use client"

import * as React from "react"
import { LayoutGrid } from "lucide-react"

interface TeamSwitcherProps {
  label: string
}

export function TeamSwitcher({ label }: TeamSwitcherProps) {
  return (
    <div className="flex min-w-0 items-center gap-3 text-slate-100">
      <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
        <LayoutGrid className="size-4" />
      </div>
      <span className="truncate text-[1.05rem] font-medium leading-none tracking-tight">{label}</span>
    </div>
  )
}

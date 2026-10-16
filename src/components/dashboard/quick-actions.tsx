"use client"

import Link from 'next/link'
import { UserPlus, Briefcase, Radio, Zap } from 'lucide-react'
import type { ComponentType } from 'react'

// Quick-action shortcuts. Each navigates to the page that owns the
// relevant "create" flow. We deliberately don't try to auto-open any
// modal on the target page — that'd require touching those pages,
// which is out of scope here.
interface Action {
  label: string
  href: string
  icon: ComponentType<{ className?: string }>
  tint: string
}

const ACTIONS: Action[] = [
  { label: 'New Contact', href: '/contacts', icon: UserPlus, tint: 'text-primary bg-primary-soft' },
  { label: 'New Deal', href: '/pipelines', icon: Briefcase, tint: 'text-sky-500 bg-sky-500/10' },
  { label: 'New Broadcast', href: '/broadcasts/new', icon: Radio, tint: 'text-amber-500 bg-amber-500/10' },
  { label: 'New Automation', href: '/automations/new', icon: Zap, tint: 'text-primary bg-primary-soft' },
]

export function QuickActions() {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span className="mr-1 text-sm font-semibold text-foreground">Quick actions</span>
      {ACTIONS.map((a) => {
        const Icon = a.icon
        return (
          <Link
            key={a.href}
            href={a.href}
            className="group flex items-center gap-2 rounded-full border border-border bg-card py-1.5 pr-4 pl-1.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary-soft-2 hover:shadow-md"
          >
            <span className={`flex h-7 w-7 items-center justify-center rounded-full ${a.tint}`}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="text-sm font-medium text-foreground">{a.label}</span>
          </Link>
        )
      })}
    </div>
  )
}

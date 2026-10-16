import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Page banner shared by the redesigned pages: soft green gradient card with
 * an icon badge, title, description and an optional right-aligned action.
 */
export function PageHero({
  icon: Icon,
  title,
  description,
  badge,
  action,
  className,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: ReactNode;
  badge?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-3xl border border-border bg-gradient-to-r from-primary-soft via-card to-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-4">
        {Icon ? (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
            <Icon className="h-6 w-6" />
          </span>
        ) : null}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              {title}
            </h2>
            {badge}
          </div>
          {description ? (
            <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

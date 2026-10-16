import type { ComponentType } from "react";

import { cn } from "@/lib/utils";

const TONES = {
  soft: "bg-primary-soft text-primary",
  solid: "bg-primary text-primary-foreground shadow-lg shadow-primary/30",
  muted: "bg-muted text-muted-foreground",
} as const;

/**
 * A rounded badge holding one icon — the placeholder used for section
 * headings and empty states. (The brand logo is reserved for the sidebar,
 * sign-in pages and the help assistant: see BrandMark.)
 * Pass the size and shape, e.g. "size-11 rounded-2xl"; the icon is half the badge.
 */
export function IconChip({
  icon: Icon,
  className,
  tone = "soft",
}: {
  icon: ComponentType<{ className?: string }>;
  className?: string;
  tone?: keyof typeof TONES;
}) {
  return (
    <span aria-hidden className={cn("flex shrink-0 items-center justify-center", TONES[tone], className)}>
      <Icon className="size-1/2" />
    </span>
  );
}

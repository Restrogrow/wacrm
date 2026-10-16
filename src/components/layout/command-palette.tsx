"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { ALL_NAV_ITEMS } from "./nav-config";

/** Ctrl/Cmd+K quick navigation. Pure UI — just routes to existing pages. */
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? ALL_NAV_ITEMS.filter((i) => i.label.toLowerCase().includes(q))
      : ALL_NAV_ITEMS;
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  if (!open) return null;

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/70 p-4 pt-[15vh] backdrop-blur-sm"
      onMouseDown={() => onOpenChange(false)}
    >
      <div
        role="dialog"
        aria-label="Quick navigation"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="size-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onOpenChange(false);
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && results[index]) {
                go(results[index].href);
              }
            }}
            placeholder="Jump to a page…"
            className="h-12 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            Esc
          </kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              No pages match &ldquo;{query}&rdquo;
            </li>
          )}
          {results.map((item, i) => (
            <li key={item.href}>
              <button
                type="button"
                onMouseEnter={() => setIndex(i)}
                onClick={() => go(item.href)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm",
                  i === index
                    ? "bg-primary-soft text-primary"
                    : "text-foreground",
                )}
              >
                <item.icon className="size-4" />
                <span className="flex-1">{item.label}</span>
                {i === index && <CornerDownLeft className="size-3.5" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

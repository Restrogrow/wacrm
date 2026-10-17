import { Megaphone } from "lucide-react";

import { adSourceLabel, type ContactAdFields } from "@/lib/ad-attribution";

/**
 * Small pill showing which Click-to-WhatsApp ad / post a contact came from.
 * Renders nothing for contacts that did not arrive from an ad.
 */
export function AdSourceBadge({
  contact,
  className = "",
}: {
  contact: ContactAdFields | null | undefined;
  className?: string;
}) {
  const label = contact ? adSourceLabel(contact) : null;
  if (!label) return null;
  return (
    <span
      title={`First message came from a Click-to-WhatsApp ${
        contact?.ad_source_type === "post" ? "post" : "ad"
      }`}
      className={`inline-flex max-w-full items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400 ${className}`}
    >
      <Megaphone className="size-3 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}

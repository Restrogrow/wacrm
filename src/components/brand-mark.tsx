import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * The Repeat Grow logo in a rounded badge. Used wherever a decorative
 * placeholder icon used to sit (page banners, section headings, empty
 * states). Pass the size/shape classes, e.g. "size-11 rounded-2xl".
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden bg-white shadow-sm ring-1 ring-black/5",
        className,
      )}
    >
      <Image
        src="/logo-v2.png"
        alt=""
        width={64}
        height={64}
        className="size-[78%] object-contain"
      />
    </span>
  );
}

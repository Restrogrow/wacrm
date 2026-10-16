"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useTotalUnread } from "@/hooks/use-total-unread";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";
import {
  ChevronsLeft,
  ChevronsRight,
  Crown,
  LogOut,
  Settings,
  Shield,
  User,
  UserCog,
  X,
} from "lucide-react";
import type { AccountRole } from "@/lib/auth/roles";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  NAV_GROUPS,
  SETTINGS_ITEM,
  isActivePath,
  type NavItem,
} from "./nav-config";

const ROLE_LABEL: Record<AccountRole, { icon: typeof Crown; label: string }> = {
  owner: { icon: Crown, label: "Owner" },
  admin: { icon: Shield, label: "Admin" },
  agent: { icon: UserCog, label: "Agent" },
  viewer: { icon: User, label: "Viewer" },
};

interface SidebarProps {
  /** Mobile drawer state, controlled by the header hamburger. Ignored on lg+. */
  open?: boolean;
  onClose?: () => void;
  /** Desktop icon-only rail. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export function Sidebar({
  open = false,
  onClose,
  collapsed = false,
  onToggleCollapsed,
}: SidebarProps) {
  const pathname = usePathname();
  const { profile, account, accountRole, signOut } = useAuth();
  const totalUnread = useTotalUnread();
  const unreadNotifications = useUnreadNotifications();

  // Close the mobile drawer on navigation.
  useEffect(() => {
    onClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Lock body scroll + Escape to close while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const roleMeta = accountRole ? ROLE_LABEL[accountRole] : null;
  const RoleIcon = roleMeta?.icon;
  const initial =
    profile?.full_name?.charAt(0)?.toUpperCase() ??
    profile?.email?.charAt(0)?.toUpperCase() ??
    "U";

  // `collapsed` only applies on lg+; the mobile drawer is always full width.
  const hideWhenCollapsed = collapsed ? "lg:hidden" : "";

  const renderItem = (item: NavItem) => {
    const active = isActivePath(pathname, item.href);
    const showInboxDot = item.href === "/inbox" && totalUnread > 0 && !active;
    const badgeCount =
      item.href === "/notifications" ? unreadNotifications : 0;

    return (
      <li key={item.href}>
        <Link
          href={item.href}
          title={collapsed ? item.label : undefined}
          aria-current={active ? "page" : undefined}
          className={cn(
            "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all lg:py-2.5",
            collapsed && "lg:justify-center lg:px-0",
            active
              ? "bg-white text-[var(--rail)] shadow-md shadow-black/20"
              : "text-white/75 hover:bg-white/10 hover:text-white",
          )}
        >
          <item.icon
            className={cn(
              "size-5 shrink-0 transition-transform",
              !active && "group-hover:scale-110",
            )}
          />
          <span className={cn("flex-1 truncate", hideWhenCollapsed)}>
            {item.label}
          </span>
          {item.beta && (
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase",
                active
                  ? "bg-[var(--rail)]/10 text-[var(--rail)]"
                  : "bg-amber-400/20 text-amber-300",
                hideWhenCollapsed,
              )}
            >
              Beta
            </span>
          )}
          {badgeCount > 0 && (
            <span
              aria-label={`${badgeCount} unread notification${badgeCount === 1 ? "" : "s"}`}
              className={cn(
                "flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold",
                active
                  ? "bg-[var(--rail)] text-white"
                  : "bg-amber-400 text-black",
                collapsed &&
                  "lg:absolute lg:top-0.5 lg:right-1.5 lg:h-4 lg:min-w-4",
              )}
            >
              {badgeCount > 9 ? "9+" : badgeCount}
            </span>
          )}
          {showInboxDot && (
            <span
              aria-label={`${totalUnread} unread conversation${totalUnread === 1 ? "" : "s"}`}
              className={cn(
                "relative flex size-2",
                collapsed && "lg:absolute lg:top-2 lg:right-3",
              )}
            >
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-amber-300" />
            </span>
          )}
        </Link>
      </li>
    );
  };

  return (
    <>
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-30 bg-background/70 backdrop-blur-sm transition-opacity lg:hidden",
          open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0",
        )}
      />

      <aside
        aria-label="Primary"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex h-full w-72 flex-col bg-[var(--rail)] text-white",
          "transition-[transform,width] duration-200 ease-out",
          open ? "translate-x-0" : "-translate-x-full",
          "lg:static lg:z-0 lg:translate-x-0",
          collapsed ? "lg:w-[76px]" : "lg:w-64",
        )}
      >
        {/* Brand row */}
        <div
          className={cn(
            "flex h-16 shrink-0 items-center justify-between gap-2 px-4",
            collapsed && "lg:justify-center lg:px-0",
          )}
        >
          <Link
            href="/dashboard"
            className={cn("flex items-center gap-2.5", hideWhenCollapsed)}
          >
            <Image
              src="/logo-v2.png"
              alt="Repeat Grow"
              width={36}
              height={36}
              className="size-9 rounded-xl"
              priority
            />
            <span
              className={cn(
                "text-[15px] font-bold tracking-tight text-white",
                hideWhenCollapsed,
              )}
            >
              Repeat Grow
            </span>
          </Link>
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden size-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white lg:flex"
          >
            {collapsed ? (
              <ChevronsRight className="size-4" />
            ) : (
              <ChevronsLeft className="size-4" />
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex size-9 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white lg:hidden"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {NAV_GROUPS.map((group, gi) => (
            <div key={group.label ?? "top"} className={gi === 0 ? "" : "mt-5"}>
              {group.label ? (
                <>
                  <div
                    className={cn(
                      "px-3 pb-1.5 text-[11px] font-bold tracking-[0.1em] text-white/45 uppercase",
                      hideWhenCollapsed,
                    )}
                  >
                    {group.label}
                  </div>
                  {collapsed && (
                    <div className="mx-3 mb-2 hidden border-t border-white/10 lg:block" />
                  )}
                </>
              ) : null}
              <ul className="flex flex-col gap-0.5">
                {group.items.map(renderItem)}
              </ul>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="shrink-0 space-y-0.5 border-t border-white/10 p-2">
          <ul className="flex flex-col gap-0.5">
            {renderItem(SETTINGS_ITEM)}
          </ul>

          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/10 p-2 text-left transition-colors hover:bg-white/15 focus:outline-none",
                collapsed &&
                  "lg:justify-center lg:border-transparent lg:bg-transparent lg:hover:bg-white/10",
              )}
            >
              <Avatar className="size-8 shrink-0">
                {profile?.avatar_url ? (
                  <AvatarImage
                    src={profile.avatar_url}
                    alt={profile.full_name ?? "Avatar"}
                  />
                ) : null}
                <AvatarFallback className="bg-white text-sm font-semibold text-[var(--rail)]">
                  {initial}
                </AvatarFallback>
              </Avatar>
              <div className={cn("min-w-0 flex-1", hideWhenCollapsed)}>
                <p className="truncate text-[13px] font-semibold text-white">
                  {profile?.full_name ?? "User"}
                </p>
                <p className="flex items-center gap-1 truncate text-[11px] text-white/60">
                  {RoleIcon && roleMeta ? (
                    <>
                      <RoleIcon className="size-3 shrink-0" />
                      {roleMeta.label}
                      {account?.name ? (
                        <span className="truncate">· {account.name}</span>
                      ) : null}
                    </>
                  ) : (
                    profile?.email
                  )}
                </p>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="top"
              sideOffset={6}
              className="min-w-56 bg-popover text-popover-foreground ring-border"
            >
              <DropdownMenuItem
                render={<Link href="/settings?tab=profile" onClick={onClose} />}
              >
                <User className="size-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem
                render={
                  <Link href="/settings?tab=whatsapp" onClick={onClose} />
                }
              >
                <Settings className="size-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border" />
              <DropdownMenuItem onClick={signOut}>
                <LogOut className="size-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

        </div>
      </aside>
    </>
  );
}

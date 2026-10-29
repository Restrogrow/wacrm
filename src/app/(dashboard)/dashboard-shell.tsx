"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Sidebar } from "@/components/layout/sidebar";
import { HelpWidget, helpWidgetCoversContent } from "@/components/assistant/help-widget";
import { cn } from "@/lib/utils";
import { CommandPalette } from "@/components/layout/command-palette";
import { Header } from "@/components/layout/header";
import { PresenceHeartbeat } from "@/components/presence/presence-heartbeat";
import { MessageNotifier } from "@/components/notifications/message-notifier";
import { PlanBanner } from "@/components/billing/plan-banner";
import { CallProvider } from "@/components/calls/call-provider";
import { NumberHealthBanner } from "@/components/settings/number-health-banner";
import { BillingHoldBanner } from "@/components/settings/billing-hold-banner";

// Auth-gated dashboard shell. Extracted from the layout so the layout
// itself can stay a server component and export metadata (noindex) —
// client components can't export Next's metadata object.

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Sidebar drawer state — only used on mobile. On lg+ the sidebar is
  // always visible and this stays at `false` (ignored by the component).
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  // Desktop icon-only rail, remembered per browser.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("sidebar-collapsed") === "1");
    } catch {}
  }, []);
  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("sidebar-collapsed", c ? "0" : "1");
      } catch {}
      return !c;
    });
  }, []);

  // Ctrl/Cmd+K quick navigation.
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    // CallProvider wraps the whole app so WhatsApp calls ring and keep
    // going on every page.
    <CallProvider>
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Reports this tab's online/away presence once we know a user is
          signed in. Headless — renders nothing. */}
      <PresenceHeartbeat />
      {/* Desktop alert + sound for new customer messages, on every page. */}
      <MessageNotifier />
      <Sidebar
        open={sidebarOpen}
        onClose={closeSidebar}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
      />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <HelpWidget />
      <div className="flex flex-1 flex-col overflow-hidden">
        <PlanBanner />
        <NumberHealthBanner />
        <BillingHoldBanner />
        <Header
          onOpenSidebar={() => setSidebarOpen(true)}
          onOpenPalette={() => setPaletteOpen(true)}
        />
        {/* Thinner horizontal padding on mobile so cards have room to breathe. */}
        {/* Extra bottom room where the help bubble floats, so a page's
            last buttons can scroll out from under it. */}
        <main className={cn("flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:transparent_transparent] hover:[scrollbar-color:var(--border)_transparent] bg-muted/30 p-4 sm:p-6 lg:p-8", helpWidgetCoversContent(pathname) && "pb-24 sm:pb-24 lg:pb-24")}>{children}</main>
      </div>
    </div>
    </CallProvider>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardShellInner>{children}</DashboardShellInner>
    </AuthProvider>
  );
}

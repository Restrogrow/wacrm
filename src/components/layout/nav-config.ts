import {
  BarChart3,
  Bell,
  Bot,
  FileSpreadsheet,
  FileText,
  Mail,
  QrCode,
  Repeat,
  CalendarCheck,
  CalendarClock,
  ClipboardList,
  GitBranch,
  IndianRupee,
  LayoutDashboard,
  MessageSquare,
  Package,
  Phone,
  Plug,
  Radio,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Truck,
  Users,
  Webhook,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Renders a small "Beta" chip. Informational only. */
  beta?: boolean;
}

export interface NavGroup {
  /** Small uppercase heading above the group; null for the top group. */
  label: string | null;
  items: NavItem[];
}

/** Single source of truth for the sidebar, header titles and ⌘K palette. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/inbox", label: "Inbox", icon: MessageSquare },
      { href: "/notifications", label: "Notifications", icon: Bell },
      { href: "/calls", label: "Calls", icon: Phone },
      { href: "/daily-summary", label: "Daily summary", icon: Mail },
      { href: "/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    label: "CRM",
    items: [
      { href: "/contacts", label: "Contacts", icon: Users },
      { href: "/pipelines", label: "Pipelines", icon: GitBranch },
      { href: "/orders", label: "Orders & payments", icon: IndianRupee },
      { href: "/catalog", label: "Catalog", icon: Package },
    ],
  },
  {
    label: "Automate & engage",
    items: [
      { href: "/broadcasts", label: "Broadcasts", icon: Radio },
      { href: "/templates", label: "Templates", icon: FileText },
      { href: "/automations", label: "Automations", icon: Zap },
      { href: "/journeys", label: "Journeys", icon: Repeat },
      { href: "/flows", label: "Flows", icon: Workflow, beta: true },
      { href: "/ai-chatbot", label: "AI chatbot", icon: Bot },
      { href: "/forms", label: "WhatsApp forms", icon: ClipboardList },
      { href: "/qr-link", label: "QR & WhatsApp link", icon: QrCode },
    ],
  },
  {
    label: "Integrations",
    items: [
      { href: "/integrations/shopify", label: "Shopify", icon: ShoppingBag },
      { href: "/integrations/woocommerce", label: "WooCommerce", icon: ShoppingCart },
      { href: "/integrations/calendly", label: "Calendly", icon: CalendarCheck },
      { href: "/integrations/calcom", label: "Cal.com", icon: CalendarClock },
      { href: "/integrations/shiprocket", label: "Shiprocket", icon: Truck },
      { href: "/integrations/google-sheets", label: "Google Sheets", icon: FileSpreadsheet },
      { href: "/integrations/hooks", label: "Webhooks & alerts", icon: Webhook },
      { href: "/integrations/apps", label: "Connected apps", icon: Plug },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = {
  href: "/settings",
  label: "Settings",
  icon: Settings,
};

export const ALL_NAV_ITEMS: NavItem[] = [
  ...NAV_GROUPS.flatMap((g) => g.items),
  SETTINGS_ITEM,
];

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
}

export function getPageTitle(pathname: string): string {
  const match = ALL_NAV_ITEMS.filter((i) => isActivePath(pathname, i.href)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
  return match?.label ?? "Dashboard";
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Users, Phone, Calendar, Mail } from "lucide-react";

import { supabaseAdmin } from "@/lib/flows/admin-client";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ROLE_META } from "@/components/settings/role-meta";
import { isAccountRole } from "@/lib/auth/roles";

export const metadata: Metadata = {
  title: "Account details",
};

interface MemberRow {
  userId: string;
  fullName: string | null;
  email: string;
  mobileNumber: string | null;
  role: string;
  joinedAt: string;
  lastSignInAt: string | null;
}

interface AccountDetail {
  id: string;
  name: string;
  createdAt: string;
  natureOfBusiness: string | null;
  teamSize: string | null;
  members: MemberRow[];
  whatsapp: {
    status: string;
    signupMethod: string;
    phoneNumberId: string | null;
    wabaId: string | null;
    businessId: string | null;
    connectedAt: string | null;
    registeredAt: string | null;
    lastRegistrationError: string | null;
  } | null;
}

async function loadAccount(id: string): Promise<AccountDetail | null> {
  const supabase = supabaseAdmin();

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id, name, created_at, nature_of_business, team_size")
    .eq("id", id)
    .maybeSingle();

  if (accountError) {
    console.error("[admin/accounts/[id]] failed to load account:", accountError);
  }
  if (!account) return null;

  const [{ data: profiles }, { data: waConfig }] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, full_name, email, mobile_number, account_role, created_at")
      .eq("account_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("whatsapp_config")
      .select(
        "status, signup_method, phone_number_id, waba_id, business_id, connected_at, registered_at, last_registration_error"
      )
      .eq("account_id", id)
      .maybeSingle(),
  ]);

  // Last sign-in isn't on `profiles` — it lives on auth.users, which only
  // the admin API exposes. One lookup per member; accounts rarely have
  // more than a handful, so this stays cheap.
  const authByUserId = new Map<string, string | null>();
  await Promise.all(
    (profiles ?? []).map(async (p) => {
      const { data } = await supabase.auth.admin.getUserById(p.user_id);
      authByUserId.set(p.user_id, data.user?.last_sign_in_at ?? null);
    })
  );

  const members: MemberRow[] = (profiles ?? []).map((p) => ({
    userId: p.user_id,
    fullName: p.full_name,
    email: p.email,
    mobileNumber: p.mobile_number,
    role: p.account_role ?? "viewer",
    joinedAt: p.created_at,
    lastSignInAt: authByUserId.get(p.user_id) ?? null,
  }));

  return {
    id: account.id,
    name: account.name,
    createdAt: account.created_at,
    natureOfBusiness: account.nature_of_business,
    teamSize: account.team_size,
    members,
    whatsapp: waConfig
      ? {
          status: waConfig.status,
          signupMethod: waConfig.signup_method,
          phoneNumberId: waConfig.phone_number_id,
          wabaId: waConfig.waba_id,
          businessId: waConfig.business_id,
          connectedAt: waConfig.connected_at,
          registeredAt: waConfig.registered_at,
          lastRegistrationError: waConfig.last_registration_error,
        }
      : null,
  };
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(value: string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function AdminAccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const account = await loadAccount(id);

  if (!account) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <Link
        href="/admin"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        All accounts
      </Link>

      <div className="mb-8">
        <h1 className="text-xl font-bold tracking-tight">{account.name}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <span>Created {formatDate(account.createdAt)}</span>
          {account.natureOfBusiness && (
            <>
              <span>·</span>
              <span>{account.natureOfBusiness}</span>
            </>
          )}
          {account.teamSize && (
            <>
              <span>·</span>
              <span>{account.teamSize} people</span>
            </>
          )}
        </p>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="size-4" />
            <span className="text-xs">Members</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-foreground">
            {account.members.length}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Phone className="size-4" />
            <span className="text-xs">WhatsApp</span>
          </div>
          <div className="mt-2">
            <Badge variant={account.whatsapp?.status === "connected" ? "default" : "outline"}>
              {account.whatsapp?.status ?? "not set up"}
            </Badge>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="size-4" />
            <span className="text-xs">Signup method</span>
          </div>
          <p className="mt-2 text-sm font-medium text-foreground capitalize">
            {account.whatsapp?.signupMethod ?? "—"}
          </p>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          Members ({account.members.length})
        </h2>
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Mobile</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Last sign-in</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {account.members.map((member) => {
                const role = isAccountRole(member.role) ? member.role : "viewer";
                const meta = ROLE_META[role];
                return (
                  <TableRow key={member.userId}>
                    <TableCell className="font-medium">
                      {member.fullName || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Mail className="size-3.5" />
                        {member.email}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {member.mobileNumber || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={meta.className}>
                        <meta.icon className="size-3" />
                        {meta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(member.joinedAt)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(member.lastSignInAt)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {account.whatsapp && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-foreground">
            WhatsApp connection
          </h2>
          <div className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Phone number ID</p>
              <p className="mt-1 font-mono text-sm text-foreground">
                {account.whatsapp.phoneNumberId || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">WABA ID</p>
              <p className="mt-1 font-mono text-sm text-foreground">
                {account.whatsapp.wabaId || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Business ID</p>
              <p className="mt-1 font-mono text-sm text-foreground">
                {account.whatsapp.businessId || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Connected at</p>
              <p className="mt-1 text-sm text-foreground">
                {formatDateTime(account.whatsapp.connectedAt)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Registered at</p>
              <p className="mt-1 text-sm text-foreground">
                {formatDateTime(account.whatsapp.registeredAt)}
              </p>
            </div>
            {account.whatsapp.lastRegistrationError && (
              <div className="sm:col-span-2">
                <p className="text-xs text-muted-foreground">
                  Last registration error
                </p>
                <p className="mt-1 text-sm text-red-400">
                  {account.whatsapp.lastRegistrationError}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

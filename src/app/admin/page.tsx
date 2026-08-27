import type { Metadata } from "next";

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

export const metadata: Metadata = {
  title: "Accounts",
};

interface AccountRow {
  id: string;
  name: string;
  created_at: string;
  owner_user_id: string;
}

async function loadAccounts() {
  const supabase = supabaseAdmin();

  const { data: accounts, error } = await supabase
    .from("accounts")
    .select("id, name, created_at, owner_user_id")
    .order("created_at", { ascending: false })
    .returns<AccountRow[]>();

  if (error) {
    console.error("[admin/page] failed to load accounts:", error);
    return [];
  }
  if (!accounts || accounts.length === 0) {
    return [];
  }

  const ownerIds = accounts.map((a) => a.owner_user_id);
  const accountIds = accounts.map((a) => a.id);

  const [{ data: owners }, { data: members }, { data: waConfigs }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("user_id, email, full_name")
        .in("user_id", ownerIds),
      supabase.from("profiles").select("account_id").in("account_id", accountIds),
      supabase
        .from("whatsapp_config")
        .select("account_id, status")
        .in("account_id", accountIds),
    ]);

  const ownerByUserId = new Map(
    (owners ?? []).map((o) => [o.user_id, o] as const)
  );
  const memberCountByAccount = new Map<string, number>();
  for (const m of members ?? []) {
    memberCountByAccount.set(
      m.account_id,
      (memberCountByAccount.get(m.account_id) ?? 0) + 1
    );
  }
  const waStatusByAccount = new Map(
    (waConfigs ?? []).map((w) => [w.account_id, w.status] as const)
  );

  return accounts.map((account) => {
    const owner = ownerByUserId.get(account.owner_user_id);
    return {
      id: account.id,
      name: account.name,
      createdAt: account.created_at,
      ownerLabel: owner?.email || owner?.full_name || "—",
      memberCount: memberCountByAccount.get(account.id) ?? 0,
      whatsappStatus: waStatusByAccount.get(account.id) ?? "not set up",
    };
  });
}

export default async function PlatformAdminPage() {
  const accounts = await loadAccounts();

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">Accounts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every Repeat Grow account, across every customer. Internal —
          not linked from anywhere in the app.
        </p>
      </div>

      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No accounts yet.</p>
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((account) => (
                <TableRow key={account.id}>
                  <TableCell className="font-medium">{account.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {account.ownerLabel}
                  </TableCell>
                  <TableCell>{account.memberCount}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        account.whatsappStatus === "connected"
                          ? "default"
                          : "outline"
                      }
                    >
                      {account.whatsappStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(account.createdAt).toLocaleDateString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

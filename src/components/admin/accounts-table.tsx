'use client';

// Platform admin: every account, searchable (name / email / phone) and
// filterable by plan, WhatsApp status and sign-up method, sortable by
// newest, last activity or members. Rows link to the account page.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AdminAccountRow } from '@/lib/admin/dashboard';
import { EFFECTIVE_PLAN_LABELS } from '@/lib/billing/plans';

type Sort = 'newest' | 'activity' | 'members';

function relative(iso: string | null): string {
  if (!iso) return '—';
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

const ALL = 'all';

export function AccountsTable({ rows }: { rows: AdminAccountRow[] }) {
  const [query, setQuery] = useState('');
  const [plan, setPlan] = useState(ALL);
  const [whatsapp, setWhatsapp] = useState(ALL);
  const [method, setMethod] = useState(ALL);
  const [sort, setSort] = useState<Sort>('newest');

  const planOptions = useMemo(
    () => [...new Set(rows.map((r) => r.plan).filter(Boolean))] as string[],
    [rows]
  );
  const methodOptions = useMemo(
    () => [...new Set(rows.map((r) => r.signupMethod))],
    [rows]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (plan !== ALL && r.plan !== plan) return false;
      if (whatsapp === 'connected' && r.whatsappStatus !== 'connected')
        return false;
      if (whatsapp === 'not' && r.whatsappStatus === 'connected') return false;
      if (method !== ALL && r.signupMethod !== method) return false;
      if (!q) return true;
      return [r.name, r.ownerEmail, r.ownerName, r.ownerMobile]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q));
    });
    return list.sort((a, b) => {
      if (sort === 'members') return b.memberCount - a.memberCount;
      if (sort === 'activity') {
        return (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '');
      }
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [rows, query, plan, whatsapp, method, sort]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search business, owner, email or phone"
            className="pl-8"
            aria-label="Search accounts"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex">
          <Select value={plan} onValueChange={(v) => setPlan(v ?? ALL)}>
            <SelectTrigger className="w-full lg:w-36" aria-label="Plan">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All plans</SelectItem>
              {planOptions.map((p) => (
                <SelectItem key={p} value={p}>
                  {EFFECTIVE_PLAN_LABELS[
                    p as keyof typeof EFFECTIVE_PLAN_LABELS
                  ] ?? p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={whatsapp} onValueChange={(v) => setWhatsapp(v ?? ALL)}>
            <SelectTrigger className="w-full lg:w-40" aria-label="WhatsApp">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any WhatsApp</SelectItem>
              <SelectItem value="connected">Connected</SelectItem>
              <SelectItem value="not">Not connected</SelectItem>
            </SelectContent>
          </Select>
          <Select value={method} onValueChange={(v) => setMethod(v ?? ALL)}>
            <SelectTrigger
              className="w-full lg:w-36"
              aria-label="Sign-up method"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any sign-up</SelectItem>
              {methodOptions.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={sort}
            onValueChange={(v) => setSort((v as Sort) ?? 'newest')}
          >
            <SelectTrigger className="w-full lg:w-40" aria-label="Sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="activity">Recently active</SelectItem>
              <SelectItem value="members">Most members</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-muted-foreground text-xs">
        {filtered.length} of {rows.length} accounts
      </p>

      <div className="border-border overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Business</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Signed up</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>WhatsApp</TableHead>
              <TableHead>Last chat</TableHead>
              <TableHead>Last login</TableHead>
              <TableHead>Team</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-muted-foreground py-8 text-center text-sm"
                >
                  No accounts match these filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.id} className="group">
                  <TableCell>
                    <Link
                      href={`/admin/accounts/${r.id}`}
                      className="font-medium hover:underline"
                    >
                      {r.name}
                    </Link>
                    <div className="text-muted-foreground text-xs">
                      {[
                        r.natureOfBusiness,
                        r.teamSize && `${r.teamSize} people`,
                      ]
                        .filter(Boolean)
                        .join(' · ') || (
                        <span className="text-amber-600 dark:text-amber-400">
                          Details missing
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <div>{r.ownerEmail ?? '—'}</div>
                    <div className="text-xs">
                      {[r.ownerName, r.ownerMobile].filter(Boolean).join(' · ')}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    <div>{relative(r.createdAt)}</div>
                    <div className="text-xs">{r.signupMethod}</div>
                  </TableCell>
                  <TableCell>
                    {r.plan ? (
                      <Badge
                        variant={
                          r.plan === 'expired' ? 'destructive' : 'outline'
                        }
                      >
                        {EFFECTIVE_PLAN_LABELS[r.plan]}
                      </Badge>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        r.whatsappStatus === 'connected' ? 'default' : 'outline'
                      }
                    >
                      {r.whatsappStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {relative(r.lastActivityAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {relative(r.lastSignInAt)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {r.memberCount}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/accounts/${r.id}`}
                      className="text-muted-foreground group-hover:text-foreground"
                      aria-label={`View ${r.name}`}
                    >
                      <ChevronRight className="size-4" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

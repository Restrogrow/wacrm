'use client';

// ============================================================
// BusinessDetailsCard — Settings → Your profile (owners only)
//
// Edit the business details collected at signup / onboarding:
// business name (accounts.name), mobile number (the owner's
// profiles.mobile_number), nature of business and team size
// (accounts). Saves through POST /api/account/onboarding, which
// validates the same option lists as the signup form.
// ============================================================

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Building2, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import {
  NATURE_OF_BUSINESS_OPTIONS,
  TEAM_SIZE_OPTIONS,
} from '@/lib/auth/business-profile';

export function BusinessDetailsCard() {
  const { isOwner, profile, accountId, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [natureOfBusiness, setNatureOfBusiness] = useState('');
  const [teamSize, setTeamSize] = useState('');

  useEffect(() => {
    if (!isOwner || !accountId || !user) return;
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const [{ data: account }, { data: me }] = await Promise.all([
        supabase
          .from('accounts')
          .select('name, nature_of_business, team_size')
          .eq('id', accountId)
          .maybeSingle(),
        supabase
          .from('profiles')
          .select('mobile_number')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setBusinessName(account?.name ?? '');
      setNatureOfBusiness(account?.nature_of_business ?? '');
      setTeamSize(account?.team_size ?? '');
      setMobileNumber(me?.mobile_number ?? '');
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isOwner, accountId, user]);

  if (!isOwner) return null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!natureOfBusiness || !teamSize) {
      toast.error('Choose the nature of your business and team size');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/account/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: profile?.full_name || profile?.email || 'Owner',
          business_name: businessName,
          mobile_number: mobileNumber,
          nature_of_business: natureOfBusiness,
          team_size: teamSize,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(json.error ?? 'Could not save');
      else toast.success('Business details saved');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-foreground flex items-center gap-2">
          <Building2 className="text-primary size-4" />
          Business details
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          Your business name, contact number, and what you do. Only the account
          owner can change these.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="text-primary size-5 animate-spin" />
          </div>
        ) : (
          <form onSubmit={save} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="business-name" className="text-foreground">
                  Business name
                </Label>
                <Input
                  id="business-name"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  autoComplete="organization"
                  required
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="business-mobile" className="text-foreground">
                  Mobile number
                </Label>
                <Input
                  id="business-mobile"
                  type="tel"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  placeholder="+91 98765 43210"
                  autoComplete="tel"
                  required
                  disabled={saving}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="business-nature" className="text-foreground">
                  Nature of business
                </Label>
                <Select
                  value={natureOfBusiness}
                  onValueChange={(value) => setNatureOfBusiness(value ?? '')}
                  disabled={saving}
                >
                  <SelectTrigger id="business-nature" className="w-full">
                    <SelectValue placeholder="Select an option" />
                  </SelectTrigger>
                  <SelectContent>
                    {NATURE_OF_BUSINESS_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="business-team" className="text-foreground">
                  Team size
                </Label>
                <Select
                  value={teamSize}
                  onValueChange={(value) => setTeamSize(value ?? '')}
                  disabled={saving}
                >
                  <SelectTrigger id="business-team" className="w-full">
                    <SelectValue placeholder="Select an option" />
                  </SelectTrigger>
                  <SelectContent>
                    {TEAM_SIZE_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                Save business details
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

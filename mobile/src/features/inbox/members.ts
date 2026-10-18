import { useEffect, useState } from 'react';

import { useSession } from '@/providers/session';

import { fetchMembers } from './queries';
import type { Member } from './types';

/** Teammates in the account (for assignment, "sent by", mentions). Cached per mount. */
export function useMembers() {
  const { accountId } = useSession();
  const [members, setMembers] = useState<Member[]>([]);
  useEffect(() => {
    if (!accountId) return;
    let active = true;
    fetchMembers().then((m) => active && setMembers(m));
    return () => {
      active = false;
    };
  }, [accountId]);
  const nameOf = (id: string | null | undefined) => {
    const m = id ? members.find((x) => x.user_id === id) : undefined;
    return m ? m.full_name || m.email || null : null;
  };
  return { members, nameOf };
}

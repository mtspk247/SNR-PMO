import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useActiveOrg } from '@/lib/store';
import { getOrgPlanInfo } from '@/lib/db';
import { OrgPlanInfo } from '@/lib/supabase';

/** Subscription shown as a small clickable subtitle under the workspace name
 *  (not a capsule). Dim by default; turns amber and gently flashes when the
 *  plan is within ~30 days of expiry, past due, or already expired. Links to Billing. */
export default function SidebarPlanBadge() {
  const org = useActiveOrg();
  const [info, setInfo] = useState<OrgPlanInfo | null>(null);
  useEffect(() => { if (org?.id) getOrgPlanInfo(org.id).then(setInfo).catch(() => {}); }, [org?.id]);
  if (!info || org?.member_role === 'guest') return null;

  const end = info.current_period_end ? new Date(info.current_period_end) : null;
  const daysLeft = end ? Math.ceil((end.getTime() - Date.now()) / 86400000) : null;
  const autoRenew = info.cancel_at_period_end == null ? true : !info.cancel_at_period_end;
  const pastDue = info.status === 'past_due' || info.status === 'canceled';
  const expiringSoon = daysLeft != null && daysLeft <= 30;
  const warn = pastDue || (daysLeft != null && daysLeft < 0) || (expiringSoon && !autoRenew);
  const planName = info.plan?.name || 'Free';

  const suffix = !warn ? '' : pastDue ? ' · payment due'
    : (daysLeft != null && daysLeft < 0) ? ' · expired'
    : daysLeft === 0 ? ' · expires today'
    : ` · renew (${daysLeft}d)`;

  return (
    <Link href="/billing" title={warn ? 'Plan expiring — manage billing' : 'Plan & billing'}
      className={`text-2xs truncate hover:underline ${warn ? 'text-amber-500 animate-flash font-medium' : 'side-dim'}`}>
      {planName}{suffix}
    </Link>
  );
}

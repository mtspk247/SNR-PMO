import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui';
import { PlanBadge } from '@/components/PlanBadge';
import { useActiveOrg } from '@/lib/store';
import { getOrgPlanInfo } from '@/lib/db';
import { OrgPlanInfo } from '@/lib/supabase';

/** Compact plan + renewal indicator under the workspace name in the sidebar.
 *  Flashes an upgrade/renew CTA when the plan expires within ~30 days (or is
 *  past_due / not auto-renewing). Hidden when the rail is collapsed. */
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
  const warn = pastDue || (expiringSoon && !autoRenew) || (daysLeft != null && daysLeft < 0);

  return (
    <div className="px-3 py-2 border-b border-line">
      <div className="flex items-center gap-1.5 flex-wrap">
        <PlanBadge planKey={info.plan?.key} planName={info.plan?.name} size="sm" />
        {end && !warn && (
          <span className="text-2xs side-dim">{autoRenew ? 'renews' : 'expires'} {end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
        )}
      </div>
      {warn && (
        <Link href="/billing" className="mt-1.5 flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-2xs font-medium bg-amber-500/10 text-amber-600 ring-1 ring-inset ring-amber-500/25 hover:bg-amber-500/20 transition animate-flash">
          <span className="inline-flex items-center gap-1">
            <Icon name="ti-alert-triangle" className="text-xs" />
            {pastDue ? 'Payment due' : (daysLeft != null && daysLeft < 0) ? 'Plan expired' : daysLeft === 0 ? 'Expires today' : `Expires in ${daysLeft}d`}
          </span>
          <span className="inline-flex items-center gap-0.5">{info.plan?.key === 'free' ? 'Upgrade' : 'Renew'}<Icon name="ti-chevron-right" className="text-xs" /></span>
        </Link>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { Icon } from '@/components/ui';
import { useAuthStore, useActiveOrg } from '@/lib/store';
import { can } from '@/lib/authz';
import { hasFeature } from '@/lib/entitlements';
import { toast } from '@/lib/toast';
import { getTenantUsage, listAgents, seedStarterAgents, seedBuiltinChatCommands } from '@/lib/db';

/**
 * Slice 3 — first-run setup checklist.
 * Shown on the dashboard to org admins/owners until every step is done (or dismissed).
 * Steps derive from live tenant state; the card disappears once the workspace is set up.
 */
interface Step { key: string; label: string; hint: string; href: string; icon: string; done: boolean; action?: () => void | Promise<void> }

export default function FirstRunChecklist() {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const router = useRouter();
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const dismissKey = org ? `snr_firstrun_dismissed_${org.id}` : '';

  useEffect(() => {
    if (typeof window !== 'undefined' && dismissKey) setDismissed(window.localStorage.getItem(dismissKey) === '1');
  }, [dismissKey]);

  useEffect(() => {
    if (!org || !can.manageOrg(org)) { setSteps(null); return; }
    let active = true;
    const agentsEnabled = hasFeature(org, 'agents');
    Promise.all([
      getTenantUsage(org.id),
      agentsEnabled ? listAgents(org.id).catch(() => [] as any[]) : Promise.resolve([] as any[]),
    ]).then(([u, agents]) => {
      if (!active) return;
      const b = org.branding || {};
      const list: Step[] = [
        { key: 'brand', label: 'Customize your branding', hint: 'Add your logo and brand colors', href: '/settings', icon: 'ti-palette', done: !!(b.logo_url || b.primary_color) },
        { key: 'team', label: 'Invite your team', hint: 'Add teammates to your workspace', href: '/users', icon: 'ti-user-plus', done: (u.seat_count || 0) > 1 },
        { key: 'project', label: 'Create your first project', hint: 'Start tracking work', href: '/projects', icon: 'ti-layout-kanban', done: (u.counts?.projects || 0) > 0 },
        { key: 'client', label: 'Add your first client', hint: 'Set up a company to deliver for', href: '/companies', icon: 'ti-building', done: (u.counts?.companies || 0) > 0 },
      ];
      if (agentsEnabled) {
        list.push({
          key: 'agents', label: 'Activate your AI agents', hint: 'Add a ready-made agent team + chat commands', href: '/agents', icon: 'ti-robot', done: ((agents as any[])?.length || 0) > 0,
          action: async () => {
            try {
              if (me?.id) await seedStarterAgents(org.id, me.id);
              await seedBuiltinChatCommands(org.id);
              toast('AI agents + chat commands activated — try "Find work" or type #task in chat', 'success');
            } catch { /* navigate anyway */ }
            router.push('/agents');
          },
        });
      }
      setSteps(list);
    }).catch(() => { if (active) setSteps(null); });
    return () => { active = false; };
  }, [org?.id]);

  if (!org || !steps || dismissed) return null;
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;
  const pct = Math.round((doneCount / steps.length) * 100);

  const dismiss = () => { if (typeof window !== 'undefined' && dismissKey) window.localStorage.setItem(dismissKey, '1'); setDismissed(true); };

  return (
    <div className="card p-5 mb-5 relative overflow-hidden">
      <button onClick={dismiss} aria-label="Dismiss" className="absolute top-3 right-3 h-7 w-7 grid place-items-center rounded-md text-muted2 hover:text-content hover:bg-surface2 transition"><Icon name="ti-x" className="text-sm" /></button>
      <div className="flex items-center gap-3 mb-1">
        <span className="w-9 h-9 rounded-lg grid place-items-center bg-accent/10 text-accentstrong shrink-0"><Icon name="ti-rocket" className="text-lg" /></span>
        <div><h3 className="text-sm font-semibold text-content">Finish setting up {org.name}</h3>
          <p className="text-2xs text-muted">{doneCount} of {steps.length} complete — get your workspace ready in a few steps.</p></div>
      </div>
      <div className="h-1.5 rounded-full bg-surface2 overflow-hidden my-3"><div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} /></div>
      <div className="grid sm:grid-cols-2 gap-2">
        {steps.map((s) => {
          const cls = `flex items-center gap-3 rounded-lg border p-3 transition text-left w-full ${s.done ? 'border-line bg-surface2/40' : 'border-line hover:border-accent/40 hover:bg-surface2'}`;
          const inner = (
            <>
              <span className={`w-7 h-7 rounded-md grid place-items-center shrink-0 ${s.done ? 'bg-emerald-500/10 text-emerald-600' : 'bg-surface2 text-muted'}`}>
                <Icon name={s.done ? 'ti-check' : s.icon} className="text-sm" />
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-medium truncate ${s.done ? 'text-muted line-through' : 'text-content'}`}>{s.label}</span>
                {!s.done && <span className="block text-2xs text-muted2 truncate">{s.hint}</span>}
              </span>
              {!s.done && <Icon name="ti-chevron-right" className="text-muted2 text-sm shrink-0" />}
            </>
          );
          return (s.action && !s.done)
            ? <button key={s.key} type="button" onClick={() => s.action!()} className={cls}>{inner}</button>
            : <Link key={s.key} href={s.href} className={cls}>{inner}</Link>;
        })}
      </div>
    </div>
  );
}

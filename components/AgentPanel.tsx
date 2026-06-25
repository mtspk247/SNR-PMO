// components/AgentPanel.tsx - the in-module agent surface: the domain agent that "lives"
// inside a module (Work, Accounting, People, CRM, HR, Support). It only READS via existing
// RLS-enforced db helpers and routes any action through the SAME approval queue every agent
// uses - it never executes a write or bypasses RBAC/approval here. Feature-gated; stays
// silent when the plan has no agents, or when a module has no agent yet (for non-managers).
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Icon } from './ui';
import { useActiveOrg, useAuthStore } from '@/lib/store';
import { hasFeature } from '@/lib/entitlements';
import { AGENT_DOMAINS, AUTONOMY_LABELS } from '@/lib/agents';
import { toast } from '@/lib/toast';
import { listAgents, listAgentActions, simulateAgentProposal, AgentDefinition, AgentDomain } from '@/lib/db';

export default function AgentPanel({ domain, className = '' }: { domain: AgentDomain; className?: string }) {
  const org = useActiveOrg();
  const me = useAuthStore((s) => s.user);
  const router = useRouter();
  const enabled = hasFeature(org, 'agents');
  const isAdmin = ['owner', 'admin'].includes(org?.member_role || '');
  const canManage = isAdmin || !!me?.can_manage_agents;
  const [agents, setAgents] = useState<AgentDefinition[] | null>(null);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const meta = AGENT_DOMAINS.find((d) => d.key === domain);

  useEffect(() => {
    if (!org?.id || !enabled) { setAgents([]); return; }
    let alive = true;
    listAgents(org.id)
      .then((all) => { if (alive) setAgents(all.filter((a) => a.domain === domain)); })
      .catch(() => { if (alive) setAgents([]); });
    listAgentActions(org.id, 'proposed')
      .then((acts) => { if (alive) setPending(acts.filter((a) => a.domain === domain).length); })
      .catch(() => {});
    return () => { alive = false; };
  }, [org?.id, enabled, domain]);

  if (!enabled || agents === null) return null;          // plan-gated, or first load
  const active = agents.find((a) => a.enabled) || agents[0] || null;
  if (!active && !canManage) return null;                // no agent + not a manager -> no clutter

  const runSample = async () => {
    if (!org || !active || busy) return;
    setBusy(true);
    try {
      await simulateAgentProposal(org.id, active.id, domain);
      toast('Proposal ready - review in Agent Approvals', 'info');
      router.push('/agent-approvals');
    } catch (e: any) {
      toast(e?.message || 'Could not run the agent', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`card p-3 mb-4 flex flex-wrap items-center gap-3 border border-line ${className}`}>
      <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-surface2 shrink-0">
        <Icon name={meta?.icon || 'ti-robot'} className="text-accentstrong" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-content truncate">{meta?.label || domain} agent</span>
          {pending > 0 && (
            <button onClick={() => router.push('/agent-approvals')} className="rounded-md px-1.5 py-0.5 text-2xs font-medium" style={{ backgroundColor: '#d9770622', color: '#d97706' }}>
              {pending} awaiting approval
            </button>
          )}
        </div>
        <p className="text-2xs text-muted truncate">
          {active
            ? `${active.name} - ${(AUTONOMY_LABELS[active.autonomy_level] || active.autonomy_level).split(' (')[0]}`
            : `No ${meta?.label || domain} agent yet - set one up to automate this module.`}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {active ? (
          <>
            {canManage && <button className="btn btn-sm" disabled={busy} onClick={runSample}><Icon name="ti-player-play" className="text-sm" />{busy ? 'Running...' : 'Try it'}</button>}
            <button className="btn btn-sm" onClick={() => router.push('/agents')}><Icon name="ti-settings" className="text-sm" />Manage</button>
          </>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={() => router.push('/agents')}><Icon name="ti-plus" className="text-sm" />Set up</button>
        )}
      </div>
    </div>
  );
}

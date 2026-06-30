import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Icon } from '@/components/ui';
import { getAgentBriefing, AgentBriefing as TBriefing } from '@/lib/db';

// "Chief-of-Staff" briefing: what the org's agents watched + queued today.
// Read-only (RLS-fenced agent_briefing RPC). Hides itself when there's nothing to say.
export default function AgentBriefing({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [b, setB] = useState<TBriefing | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let on = true;
    getAgentBriefing(orgId).then((x) => { if (on) { setB(x); setLoaded(true); } }).catch(() => { if (on) setLoaded(true); });
    return () => { on = false; };
  }, [orgId]);
  if (!loaded || !b) return null;
  const { awaiting, watched_today: watched, executed_today: auto, rolled_back_today: rb } = b;
  if (watched === 0 && awaiting === 0 && auto === 0) return null;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return (
    <div className="card p-4 mb-5 border border-line bg-gradient-to-br from-accent/5 to-transparent">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 h-9 w-9 shrink-0 grid place-items-center rounded-full bg-accent/15 text-accentstrong"><Icon name="ti-robot" className="text-lg" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-content">{greet} — your agents&rsquo; briefing</h3>
          <p className="text-2xs text-muted mt-0.5">
            {watched > 0 ? `Watched your workspace ${watched}× today. ` : ''}
            {awaiting > 0 ? `${awaiting} proposal${awaiting > 1 ? 's' : ''} await your approval.` : 'Nothing needs you right now.'}
            {auto > 0 ? ` ${auto} handled automatically today (reversible).` : ''}
            {rb > 0 ? ` ${rb} rolled back.` : ''}
          </p>
          {b.top.length > 0 && (
            <ul className="mt-2.5 space-y-1">
              {b.top.slice(0, 4).map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-xs min-w-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.risk === 'high' ? 'bg-rose-500' : t.risk === 'medium' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                  <span className="truncate text-content">{t.summary}</span>
                  <span className="text-2xs text-muted2 shrink-0 hidden sm:inline">{t.agent || t.domain}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {awaiting > 0 && <button onClick={() => router.push('/agent-approvals')} className="btn btn-primary btn-sm shrink-0 whitespace-nowrap"><Icon name="ti-checks" />Review {awaiting}</button>}
      </div>
    </div>
  );
}

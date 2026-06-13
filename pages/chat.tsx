import { useState } from 'react';
import Layout from '@/components/Layout';
import { Icon, Spinner } from '@/components/ui';
import { ChatThread, ChannelSelect } from '@/components/ChatPanel';
import { useProjects } from '@/lib/queries';

// S5 — standalone chat page. Same ChatThread as the Layout slide-in panel;
// here with a persistent channel rail (org channel + RLS-scoped projects).
export default function ChatPage() {
  const { data: projects = [], isLoading } = useProjects();
  const [channel, setChannel] = useState<string | null>(null);

  const ChannelButton = ({ id, name }: { id: string | null; name: string }) => (
    <button onClick={() => setChannel(id)}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition ${
        channel === id ? 'bg-accent/10 text-accent font-medium' : 'text-muted hover:text-content hover:bg-surface2'}`}>
      <Icon name={id === null ? 'ti-broadcast' : 'ti-hash'} className="text-sm shrink-0" />
      <span className="truncate">{name}</span>
    </button>
  );

  const title = channel === null ? 'General' : projects.find((p) => p.id === channel)?.name || 'Channel';

  return (
    <Layout title="Chat">
      <div className="h-[calc(100vh-7rem)] min-h-[24rem] flex gap-4">
        {/* Channel rail (≥lg). On smaller screens the header select takes over. */}
        <aside className="hidden lg:flex w-60 shrink-0 flex-col bg-surface border border-line rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-line">
            <p className="text-sm font-semibold">Channels</p>
            <p className="text-2xs text-muted2">Org-wide + your projects</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            <ChannelButton id={null} name="General (everyone)" />
            <div className="px-3 pt-3 pb-1 text-2xs font-medium uppercase tracking-wide text-muted2">Projects</div>
            {isLoading ? <Spinner /> : projects.length === 0 ? (
              <p className="px-3 py-2 text-2xs text-muted2">No projects visible to you</p>
            ) : projects.map((p) => <ChannelButton key={p.id} id={p.id} name={p.name} />)}
          </div>
        </aside>

        {/* Thread */}
        <section className="flex-1 min-w-0 flex flex-col bg-surface border border-line rounded-lg overflow-hidden">
          <div className="shrink-0 flex items-center gap-2.5 px-4 py-3 border-b border-line">
            <span className="w-8 h-8 rounded-md grid place-items-center bg-accent/10 text-accent shrink-0">
              <Icon name={channel === null ? 'ti-broadcast' : 'ti-hash'} className="text-base" />
            </span>
            <div className="min-w-0 hidden lg:block">
              <p className="text-sm font-semibold truncate">{title}</p>
              <p className="text-2xs text-muted2">{channel === null ? 'Everyone in the organisation' : 'Project channel — members with project access'}</p>
            </div>
            <ChannelSelect channel={channel} onChange={setChannel} className="lg:hidden flex-1 min-w-0 h-8 text-xs" />
          </div>
          <ChatThread channel={channel} />
        </section>
      </div>
    </Layout>
  );
}

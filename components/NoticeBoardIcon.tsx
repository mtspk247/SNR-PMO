import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Icon } from '@/components/ui';
import { unreadNoticeCount } from '@/lib/db';
import { useActiveOrg } from '@/lib/store';

export default function NoticeBoardIcon() {
  const org = useActiveOrg();
  const router = useRouter();
  const [n, setN] = useState(0);
  const load = () => { if (org) unreadNoticeCount().then(setN).catch(() => {}); };
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [org?.id]);
  return (
    <button onClick={() => router.push('/notices')} title="Notice board"
      className="h-9 w-9 grid place-items-center rounded-lg border border-line text-muted hover:text-content hover:bg-surface2 transition relative">
      <Icon name="ti-speakerphone" className="text-base" />
      {n > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-[#fff] text-2xs grid place-items-center">{n > 9 ? '9+' : n}</span>}
    </button>
  );
}

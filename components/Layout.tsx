import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuthStore } from '@/lib/store';
import { Icon, Avatar, Spinner } from '@/components/ui';

const MAIN = [
  { href: '/dashboard', label: 'Dashboard', icon: 'ti-layout-dashboard' },
  { href: '/projects', label: 'Projects', icon: 'ti-folder' },
  { href: '/tasks', label: 'Tasks', icon: 'ti-checkbox' },
  { href: '/crm', label: 'CRM', icon: 'ti-users' },
  { href: '/risk', label: 'Risk Analysis', icon: 'ti-alert-triangle' },
  { href: '/financial', label: 'Financial Data', icon: 'ti-currency-dollar' },
];
const SECONDARY = [
  { href: '/attendance', label: 'Attendance', icon: 'ti-clock' },
  { href: '/leave', label: 'Leave', icon: 'ti-beach' },
];

export default function Layout({ title, children }: { title: string; children: React.ReactNode }) {
  const router = useRouter();
  const { user, hasHydrated, logout } = useAuthStore();

  useEffect(() => {
    if (hasHydrated && !user) router.replace('/login');
  }, [hasHydrated, user, router]);

  if (!hasHydrated) return <div className="h-screen bg-paper"><Spinner /></div>;
  if (!user) return null;

  const NavLink = ({ href, label, icon }: { href: string; label: string; icon: string }) => (
    <Link href={href} className={`nav-item ${router.pathname === href ? 'nav-item-active' : ''}`}>
      <Icon name={icon} className="text-base" />{label}
    </Link>
  );

  const handleLogout = () => { logout(); router.replace('/login'); };

  return (
    <div className="flex h-screen bg-paper text-ink">
      <aside className="w-60 shrink-0 border-r border-line bg-white flex flex-col">
        <div className="flex items-center gap-2.5 px-4 h-14 border-b border-line">
          <span className="w-7 h-7 rounded-md bg-ink text-white grid place-items-center text-sm font-semibold">S</span>
          <span className="font-semibold">SNR-PMO</span>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {MAIN.map((i) => <NavLink key={i.href} {...i} />)}
          <p className="px-2.5 pt-4 pb-1 text-2xs uppercase tracking-wide text-neutral-400">Operations</p>
          {SECONDARY.map((i) => <NavLink key={i.href} {...i} />)}
        </nav>
        <div className="p-3 border-t border-line">
          <div className="flex items-center gap-2.5 px-1">
            <Avatar name={user.full_name} size={32} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{user.full_name}</p>
              <p className="text-2xs text-neutral-500 capitalize truncate">{user.role.replace('_', ' ')}</p>
            </div>
            <button onClick={handleLogout} title="Sign out" className="btn-ghost p-1.5 rounded-md text-neutral-500 hover:text-ink">
              <Icon name="ti-logout" className="text-base" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 border-b border-line bg-white/80 backdrop-blur flex items-center justify-between px-6">
          <h2 className="font-medium">{title}</h2>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 h-9 px-3 rounded-md border border-line text-sm text-neutral-400">
              <Icon name="ti-search" />Search
            </div>
            <button className="btn-ghost p-2 rounded-md text-neutral-500 relative">
              <Icon name="ti-bell" className="text-base" />
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}

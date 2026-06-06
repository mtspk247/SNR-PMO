import Link from 'next/link';
import { getSession } from '@/lib/session';

export const dynamic='force-dynamic';

const FEATURES=[
  {ic:'▦',c:'tint-p',t:'Projects & Tasks',d:'Kanban boards, subtasks with blocking rules, assignees, followers, tags and auto-tracked progress.'},
  {ic:'👤',c:'tint-b',t:'Built-in CRM',d:'Manage contacts, companies and a visual deal pipeline from Lead to Won — all in the same workspace.'},
  {ic:'🧩',c:'tint-pk',t:'Integrations',d:'Connect Slack, Gmail, HubSpot, Stripe, QuickBooks and more from one integrations hub.'},
  {ic:'◷',c:'tint-g',t:'Attendance & Leave',d:'One-tap check-in/out, auto-checkout, leave requests with approval chains and balances.'},
  {ic:'🔔',c:'tint-a',t:'Smart Notifications',d:'Real-time alerts that bubble up your reporting hierarchy, with @mentions and an audit trail.'},
  {ic:'◧',c:'tint-r',t:'Role-based Dashboards',d:'Every role sees what matters — workload, approvals, overdue work and team status at a glance.'},
];

export default async function Landing(){
  const s=await getSession();
  return(<div>
    <nav className="lp-nav">
      <div className="lp-brand"><span className="sb-mark">S&amp;R</span> Shahzad &amp; Rainer</div>
      <div className="toolbar">
        <a href="#features" className="btn ghost sm">Features</a>
        <a href="#about" className="btn ghost sm">About</a>
        <Link href={s?'/dashboard':'/login'} className="btn">{s?'Open Dashboard':'Sign In'}</Link>
      </div>
    </nav>

    <header className="lp-hero">
      <span className="lp-pill">✦ One platform for projects, people & pipeline</span>
      <h1>Run your whole operation <span className="g">in one clean workspace</span></h1>
      <p>Shahzad &amp; Rainer brings project management, CRM, attendance, leave and integrations together — fast, modern, and built for distributed teams.</p>
      <div className="lp-cta">
        <Link href={s?'/dashboard':'/login'} className="btn bigbtn">{s?'Go to Dashboard':'Get Started →'}</Link>
        <a href="#features" className="btn alt bigbtn">Explore Features</a>
      </div>
      <div className="lp-logos"><span title="Slack">💬</span><span title="Gmail">✉️</span><span title="Calendar">📅</span><span title="HubSpot">🟠</span><span title="Stripe">💳</span><span title="GitHub">🐙</span><span title="QuickBooks">📊</span><span title="Zapier">⚡</span></div>
    </header>

    <section className="lp-sec lp-wrap" id="features">
      <h2>Everything your team needs</h2>
      <p className="sub">No more juggling five tools. Plan work, close deals and manage people in a single, beautifully simple system.</p>
      <div className="lp-feat">
        {FEATURES.map((f,i)=>(<div className="lp-fc" key={i} style={{animationDelay:`${i*60}ms`}}>
          <div className={`lp-ico ${f.c}`}>{f.ic}</div>
          <h3>{f.t}</h3><p className="muted" style={{margin:0}}>{f.d}</p>
        </div>))}
      </div>
    </section>

    <section className="lp-sec lp-wrap" id="about">
      <div className="lp-band">
        <h2>About Shahzad &amp; Rainer</h2>
        <p>We build the operating system for modern service businesses — uniting delivery, sales and operations so teams move faster with less overhead. This platform is our all-in-one workspace for getting work done and growing client relationships.</p>
        <Link href={s?'/dashboard':'/login'} className="btn bigbtn" style={{background:'#fff',color:'var(--primary)'}}>{s?'Open Dashboard':'Sign In to Continue'}</Link>
        <div className="lp-stats">
          <div className="lp-stat"><div className="n">6+</div><div className="muted">Core modules</div></div>
          <div className="lp-stat"><div className="n">8</div><div className="muted">Integrations</div></div>
          <div className="lp-stat"><div className="n">4</div><div className="muted">Role levels</div></div>
          <div className="lp-stat"><div className="n">1</div><div className="muted">Unified workspace</div></div>
        </div>
      </div>
    </section>

    <footer className="lp-foot">© {new Date().getFullYear()} Shahzad &amp; Rainer · Operations Platform · <Link href="/login" style={{color:'var(--primary)'}}>Sign in</Link></footer>
  </div>);
}

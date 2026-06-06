'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const SECTIONS=[
  {sec:'Workspace',items:[
    {href:'/dashboard',label:'Dashboard',ic:'◧'},
    {href:'/projects',label:'Projects',ic:'▦'},
    {href:'/tasks',label:'Tasks',ic:'✔'},
  ]},
  {sec:'CRM',items:[
    {href:'/crm',label:'Contacts',ic:'👤'},
    {href:'/crm/companies',label:'Companies',ic:'🏢'},
    {href:'/crm/deals',label:'Deals',ic:'📈'},
  ]},
  {sec:'Operations',items:[
    {href:'/attendance',label:'Attendance',ic:'◷'},
    {href:'/leave',label:'Leave',ic:'✈'},
    {href:'/notifications',label:'Notifications',ic:'🔔'},
    {href:'/integrations',label:'Integrations',ic:'🧩'},
  ]},
];
const ADMIN=[{href:'/users',label:'Users',ic:'☷'},{href:'/audit',label:'Audit Log',ic:'❑'},{href:'/settings',label:'Settings',ic:'⚙'}];

export function Shell({children,role,fullName,unread}:{children:React.ReactNode;role:string;fullName:string;unread:number}) {
  const path=usePathname();const r=useRouter();
  const [collapsed,setCollapsed]=useState(false);
  useEffect(()=>{const v=localStorage.getItem('sr_sb');if(v==='1')setCollapsed(true);},[]);
  function toggle(){setCollapsed(c=>{localStorage.setItem('sr_sb',c?'0':'1');return !c;});}
  const is=(h:string)=>h==='/dashboard'?path==='/dashboard':path.startsWith(h);
  async function logout(){await fetch('/api/auth/logout',{method:'POST'});r.push('/login');r.refresh();}
  const title=[...SECTIONS.flatMap(s=>s.items),...ADMIN].find(i=>is(i.href))?.label||'Dashboard';
  return(
    <div className="shell">
      <aside className={`sidebar ${collapsed?'collapsed':''}`}>
        <div className="sb-top">
          <div className="sb-mark">S&amp;R</div>
          <div className="sb-name">Shahzad &amp; Rainer<small>Operations Platform</small></div>
        </div>
        <nav className="nav">
          {SECTIONS.map(g=>(<div key={g.sec}>
            <div className="nav-sec">{g.sec}</div>
            {g.items.map(i=>(<Link key={i.href} href={i.href} className={is(i.href)?'active':''} title={i.label}>
              <span className="ic">{i.ic}</span><span>{i.label}</span>
              {i.href==='/notifications'&&unread>0&&<span className="b b-red np" style={{marginLeft:'auto',padding:'0 7px'}}>{unread}</span>}
            </Link>))}
          </div>))}
          {role==='super_admin'&&(<div><div className="nav-sec">Admin</div>
            {ADMIN.map(i=>(<Link key={i.href} href={i.href} className={is(i.href)?'active':''} title={i.label}><span className="ic">{i.ic}</span><span>{i.label}</span></Link>))}
          </div>)}
        </nav>
        <button className="sb-toggle" onClick={toggle}>{collapsed?'»':'«  Collapse'}</button>
      </aside>
      <div className={`main ${collapsed?'wide':''}`}>
        <div className="topbar">
          <div className="pagetitle">{title}</div>
          <div className="right">
            <Link href="/notifications" className="bell">🔔{unread>0&&<span className="badge">{unread}</span>}</Link>
            <div className="avatar" title={fullName}>{fullName.split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase()}</div>
            <button className="btn ghost sm" onClick={logout}>Logout</button>
          </div>
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}

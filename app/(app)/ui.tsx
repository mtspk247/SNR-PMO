'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function Modal({ label, title, children, variant }:{label:React.ReactNode;title:string;children:React.ReactNode;variant?:string}) {
  const [open,setOpen]=useState(false);
  return (<>
    <button className={`btn ${variant||''}`} onClick={()=>setOpen(true)}>{label}</button>
    {open && (
      <div className="modal-ov" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}>
        <div className="modal">
          <div className="modal-h"><h3>{title}</h3><button className="x" onClick={()=>setOpen(false)}>✕</button></div>
          <div className="modal-b" onSubmitCapture={()=>setTimeout(()=>setOpen(false),120)}>{children}</div>
        </div>
      </div>
    )}
  </>);
}

export function ActionButton({action,label,variant,confirm}:{action:(fd:FormData)=>Promise<any>;label:string;variant?:string;confirm?:string}) {
  const r=useRouter();const[busy,setBusy]=useState(false);const[err,setErr]=useState('');
  async function go(){if(confirm&&!window.confirm(confirm))return;setBusy(true);setErr('');const res:any=await action(new FormData());setBusy(false);if(res?.error)setErr(res.error);else r.refresh();}
  return(<span>
    <button className={`btn ${variant||''}`} disabled={busy} onClick={go}>{busy?'…':label}</button>
    {err&&<span className="b b-red np" style={{marginLeft:'.5rem'}}>{err}</span>}
  </span>);
}

const MAP:any={Done:'b-green',Active:'b-green',Approved:'b-green',Won:'b-green',Customer:'b-green',Completed:'b-green',
 'In Progress':'b-amber',Pending:'b-amber',Proposal:'b-amber',Qualified:'b-blue',Review:'b-blue','To Do':'b-blue',Lead:'b-purple',
 Negotiation:'b-pink',Planning:'b-blue','On Hold':'b-gray',Cancelled:'b-gray',Backlog:'b-gray',Inactive:'b-gray',Lost:'b-red',Rejected:'b-red',
 Urgent:'b-red',High:'b-amber',Medium:'b-blue',Low:'b-gray'};
export function StatusBadge({s}:{s:string}){return <span className={`b ${MAP[s]||'b-gray'}`}>{s}</span>;}

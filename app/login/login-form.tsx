'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginForm() {
  const r=useRouter();const[u,setU]=useState('');const[p,setP]=useState('');const[err,setErr]=useState('');const[loading,setLoading]=useState(false);
  async function submit(e:React.FormEvent){e.preventDefault();setErr('');setLoading(true);
    const res=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
    setLoading(false);
    if(res.ok){r.push('/dashboard');r.refresh();}else{const j=await res.json().catch(()=>({}));setErr(j.error||'Login failed');}}
  return(
    <form onSubmit={submit} className="login-card">
      <div className="login-logo">Shahzad &amp; Rainer</div>
      <p className="login-sub">Sign in to your operations workspace</p>
      {err&&<div className="alert-error">{err}</div>}
      <label>Username</label>
      <input value={u} onChange={e=>setU(e.target.value)} autoFocus placeholder="admin" />
      <label>Password</label>
      <input type="password" value={p} onChange={e=>setP(e.target.value)} placeholder="••••••••" />
      <button disabled={loading} type="submit">{loading?'Signing in…':'Sign In'}</button>
      <p className="login-hint">Demo admin: <code>admin</code> / <code>SnrPmo@2026</code> · <Link href="/" style={{color:'var(--primary)'}}>← Back to home</Link></p>
    </form>
  );
}

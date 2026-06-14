import { useEffect, useState } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { PageHeader, Spinner, EmptyState, Icon } from '@/components/ui';
import { useActiveOrg } from '@/lib/store';
import { can } from '@/lib/authz';
import { getOrgOptions, addOption, updateOption, deleteOption, reorderOptions, OrgOption } from '@/lib/db';

const LISTS = [
  { key: 'task_priority', label: 'Task priorities', icon: 'ti-flag', hint: 'Tasks board grouping, the priority filter and the task form.' },
  { key: 'ledger_income', label: 'Income categories', icon: 'ti-cash', hint: 'Accounting — income entries.' },
  { key: 'ledger_expense', label: 'Expense categories', icon: 'ti-receipt-2', hint: 'Accounting — expense entries.' },
  { key: 'industry', label: 'Industries', icon: 'ti-building-factory-2', hint: 'Welcome wizard — industry picker.' },
  { key: 'use_case', label: 'Use cases', icon: 'ti-target-arrow', hint: 'Welcome wizard — primary use-case.' },
];

export default function ListsPage() {
  const org = useActiveOrg();
  const admin = can.manageOrg(org);
  const [selKey, setSelKey] = useState(LISTS[0].key);
  const [items, setItems] = useState<OrgOption[] | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [editId, setEditId] = useState(''); const [editLabel, setEditLabel] = useState('');

  const load = () => { if (!org) return; setItems(null); getOrgOptions(org.id, selKey).then(setItems).catch((e) => { setErr(e.message); setItems([]); }); };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [org?.id, selKey]);

  if (!org) return <Layout flat title="Lists & options"><Spinner /></Layout>;
  if (!admin) return <Layout flat title="Lists & options"><EmptyState icon="ti-lock" title="Admins only" text="Managing lists is restricted to workspace owners and admins." /></Layout>;

  const cur = LISTS.find((l) => l.key === selKey)!;
  const add = async () => { if (!newLabel.trim()) return; setBusy(true); setErr(''); try { await addOption(org.id, selKey, newLabel.trim()); setNewLabel(''); load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const saveEdit = async (it: OrgOption) => { setBusy(true); setErr(''); try { await updateOption(it.id, editLabel.trim() || it.label, it.active); setEditId(''); load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const toggle = async (it: OrgOption) => { setBusy(true); try { await updateOption(it.id, it.label, !it.active); load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const remove = async (it: OrgOption) => { if (!confirm(`Remove "${it.label}"?`)) return; setBusy(true); try { await deleteOption(it.id); load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } };
  const move = async (idx: number, dir: -1 | 1) => { if (!items) return; const j = idx + dir; if (j < 0 || j >= items.length) return; const arr = items.slice(); const [m] = arr.splice(idx, 1); arr.splice(j, 0, m); setItems(arr); try { await reorderOptions(arr.map((x) => x.id)); } catch (e: any) { setErr(e.message); load(); } };

  return (
    <Layout flat title="Lists & options">
      <PageHeader title="Lists & options" subtitle="Manage the dropdown options used across your workspace" icon="ti-list-details" />
      {err && <p className="text-sm text-rose-600 mb-3">{err}</p>}
      <div className="grid lg:grid-cols-[16rem_1fr] gap-4">
        <div className="card p-2 h-fit">
          {LISTS.map((l) => (
            <button key={l.key} onClick={() => setSelKey(l.key)} className={`w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${selKey === l.key ? 'bg-accent/10 text-accentstrong font-medium' : 'text-muted hover:bg-surface2'}`}>
              <Icon name={l.icon} className="text-base shrink-0" />{l.label}
            </button>
          ))}
          <div className="border-t border-line mt-2 pt-2 px-1">
            <p className="text-2xs text-muted2 mb-1.5">Managed elsewhere</p>
            <Link href="/roles" className="block text-2xs text-accentstrong hover:underline py-1">Roles &amp; permissions (RBAC) →</Link>
            <Link href="/tasks" className="block text-2xs text-accentstrong hover:underline py-1">Task statuses (on the board) →</Link>
            <Link href="/crm" className="block text-2xs text-accentstrong hover:underline py-1">CRM pipeline stages →</Link>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-1"><Icon name={cur.icon} className="text-lg text-accentstrong" /><h3 className="text-sm font-semibold text-content">{cur.label}</h3></div>
          <p className="text-2xs text-muted mb-4">{cur.hint}</p>
          <div className="flex items-center gap-2 mb-4 max-w-md">
            <input className="input flex-1" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} placeholder="Add a new item…" />
            <button className="btn btn-primary shrink-0" disabled={busy || !newLabel.trim()} onClick={add}><Icon name="ti-plus" />Add</button>
          </div>
          {items === null ? <Spinner /> : items.length === 0 ? <EmptyState icon="ti-list" text="No items." /> : (
            <div className="divide-y divide-line">
              {items.map((it, idx) => (
                <div key={it.id} className="flex items-center gap-2 py-2">
                  <div className="flex flex-col">
                    <button disabled={idx === 0} onClick={() => move(idx, -1)} className="text-muted2 hover:text-content disabled:opacity-30 leading-none"><Icon name="ti-chevron-up" className="text-xs" /></button>
                    <button disabled={idx === items.length - 1} onClick={() => move(idx, 1)} className="text-muted2 hover:text-content disabled:opacity-30 leading-none"><Icon name="ti-chevron-down" className="text-xs" /></button>
                  </div>
                  {editId === it.id ? (
                    <input className="input flex-1 h-8" value={editLabel} onChange={(e) => setEditLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(it); if (e.key === 'Escape') setEditId(''); }} autoFocus />
                  ) : (
                    <span className={`flex-1 text-sm ${it.active ? 'text-content' : 'text-muted2 line-through'}`}>{it.label}</span>
                  )}
                  {editId === it.id
                    ? <><button className="btn-ghost text-2xs" onClick={() => saveEdit(it)}>Save</button><button className="btn-ghost text-2xs" onClick={() => setEditId('')}>Cancel</button></>
                    : <>
                        <button className="btn-ghost text-2xs" onClick={() => { setEditId(it.id); setEditLabel(it.label); }} title="Rename"><Icon name="ti-pencil" /></button>
                        <button className="btn-ghost text-2xs" onClick={() => toggle(it)} title={it.active ? 'Disable' : 'Enable'}><Icon name={it.active ? 'ti-eye' : 'ti-eye-off'} /></button>
                        <button className="btn-ghost text-2xs text-rose-600" onClick={() => remove(it)} title="Remove"><Icon name="ti-trash" /></button>
                      </>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

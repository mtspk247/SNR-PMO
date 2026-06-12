import { useState } from 'react';
import { Modal, Field } from '@/components/Modal';
import { Employee, OrgCompany, Role } from '@/lib/supabase';

const ROLES: { value: Role; label: string }[] = [
  { value: 'team_member', label: 'Team member' },
  { value: 'pm', label: 'Project manager' },
  { value: 'viewer', label: 'Viewer' },
  { value: 'super_admin', label: 'Super admin' },
];

export interface EmployeeFormValues {
  full_name: string; email: string; role: Role;
  department: string | null; job_title: string | null; hire_date: string | null;
  company_id: string | null; phone: string | null; address: string | null;
  emergency_contact: string | null; reports_to: string | null;
  status?: 'active' | 'suspended';
}

// Shared create/edit employee profile form. Create goes through the
// create_employee RPC (unlinked snrpmo.users row); edit is a users update.
export default function EmployeeModal({ initial, people, companies, busy, onClose, onSubmit }: {
  initial?: Employee | null;
  people: { id: string; full_name: string }[];
  companies: OrgCompany[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (v: EmployeeFormValues) => void;
}) {
  const edit = !!initial;
  const [name, setName] = useState(initial?.full_name || '');
  const [email, setEmail] = useState(initial?.email || '');
  const [role, setRole] = useState<Role>(initial?.role || 'team_member');
  const [dept, setDept] = useState(initial?.department || '');
  const [job, setJob] = useState(initial?.job_title || '');
  const [hired, setHired] = useState(initial?.hire_date || '');
  const [companyId, setCompanyId] = useState(initial?.company_id || '');
  const [phone, setPhone] = useState(initial?.phone || '');
  const [address, setAddress] = useState(initial?.address || '');
  const [emergency, setEmergency] = useState(initial?.emergency_contact || '');
  const [reportsTo, setReportsTo] = useState(initial?.reports_to || '');
  const [status, setStatus] = useState<'active' | 'suspended'>(initial?.status || 'active');

  const valid = !!name.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const submit = () => valid && onSubmit({
    full_name: name.trim(), email: email.trim().toLowerCase(), role,
    department: dept.trim() || null, job_title: job.trim() || null, hire_date: hired || null,
    company_id: companyId || null, phone: phone.trim() || null, address: address.trim() || null,
    emergency_contact: emergency.trim() || null, reports_to: reportsTo || null,
    ...(edit ? { status } : {}),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={edit ? 'Edit employee profile' : 'New employee'}
      subtitle={edit ? `Update ${initial!.full_name}'s profile.` : 'Creates a directory profile (no login until linked).'}
      icon={edit ? 'ti-user-edit' : 'ti-user-plus'}
      size="lg"
      onSubmit={() => { if (!busy && valid) submit(); }}
      footer={
        <>
          <span className="hidden sm:block text-2xs text-muted2 mr-auto">⌘↵ to save</span>
          <button onClick={onClose} className="btn">Cancel</button>
          <button onClick={submit} disabled={busy || !valid} className="btn btn-primary min-w-[8rem]">
            {busy ? 'Saving…' : edit ? 'Save changes' : 'Create employee'}
          </button>
        </>
      }
    >
      <div className="grid sm:grid-cols-2 gap-3.5">
        <Field label="Full name" required>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aisha Khan" className="input" />
        </Field>
        <Field label="Email" required hint={edit ? undefined : 'Used to link a login later.'}>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" className="input" />
        </Field>
        <Field label="Role">
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="input">
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </Field>
        <Field label="Department">
          <input value={dept} onChange={(e) => setDept(e.target.value)} placeholder="e.g. Engineering" className="input" />
        </Field>
        <Field label="Job title">
          <input value={job} onChange={(e) => setJob(e.target.value)} placeholder="e.g. Senior Designer" className="input" />
        </Field>
        <Field label="Hire date">
          <input type="date" value={hired} onChange={(e) => setHired(e.target.value)} className="input" />
        </Field>
        <Field label="Company">
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="input">
            <option value="">—</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Reports to">
          <select value={reportsTo} onChange={(e) => setReportsTo(e.target.value)} className="input">
            <option value="">—</option>
            {people.filter((p) => p.id !== initial?.id).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </Field>
        <Field label="Phone">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+92 …" className="input" />
        </Field>
        {edit && (
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'suspended')} className="input">
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </Field>
        )}
        <div className="sm:col-span-2">
          <Field label="Address">
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city" className="input" />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Emergency contact" hint="Name + phone of who to call.">
            <input value={emergency} onChange={(e) => setEmergency(e.target.value)} placeholder="e.g. Sara Khan · +92 300 0000000" className="input" />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

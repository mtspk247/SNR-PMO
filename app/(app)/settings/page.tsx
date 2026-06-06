import { db } from '@/lib/supabase';
import { getSession } from '@/lib/session';
import { saveSetting } from '@/app/actions/admin';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';
const FIELDS = [['company_name','Company Name'],['timezone','Timezone'],['check_in_deadline','Check-in Deadline'],['eod_email_time','EOD Email Time'],['auto_checkout_time','Auto-checkout Time']];

export default async function Settings() {
  const s = (await getSession())!;
  if (s.role !== 'super_admin') redirect('/');
  const { data: config } = await db().from('config').select('*');
  const val = (k: string) => (config || []).find(c => c.key === k)?.value || '';
  return (
    <div>
      <h1>Settings</h1>
      <div className="card" style={{ maxWidth: 560 }}>
        <h3>System Configuration</h3>
        {FIELDS.map(([k,l]) => (
          <form key={k} action={saveSetting} className="row" style={{ alignItems: 'flex-end', marginBottom: '.6rem' }}>
            <input type="hidden" name="key" value={k} />
            <div className="field" style={{ flex: 1, margin: 0 }}><label>{l}</label><input name="value" defaultValue={val(k)} /></div>
            <button className="btn alt">Save</button>
          </form>
        ))}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui';
import { MODULE_GROUPS } from '@/lib/nav';
import { PagePerms, PagePerm } from '@/lib/supabase';

// #roles-crud — collapsible module->page matrix. module = a sidebar menu group.
// Each module row has its own C/V/E/D that cascades to every page in it, shows
// Full/Partial/None, and pages stay individually editable. Absent cell = allowed (true).

const OPS: { k: keyof PagePerm; label: string; title: string }[] = [
  { k: 'c', label: 'Create', title: 'Create' },
  { k: 'r', label: 'View', title: 'View (read) — uncheck to stop this role/user seeing the page' },
  { k: 'u', label: 'Edit', title: 'Edit (update)' },
  { k: 'd', label: 'Delete', title: 'Delete' },
];

const val = (pp: PagePerms, href: string, k: keyof PagePerm): boolean => {
  const v = pp[href]?.[k];
  return v === undefined ? true : !!v;
};

// Checkbox that can show an indeterminate (partial) state via a ref.
function TriCheck({ checked, indeterminate, disabled, title, onChange }: { checked: boolean; indeterminate?: boolean; disabled?: boolean; title?: string; onChange: (on: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate && !checked; }, [indeterminate, checked]);
  return <input ref={ref} type="checkbox" disabled={disabled} title={title} checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-accent w-4 h-4" />;
}

export default function PagePermTree({ value, onChange, disabled }: { value: PagePerms; onChange: (next: PagePerms) => void; disabled?: boolean }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const cellOf = (href: string): PagePerm => ({ c: val(value, href, 'c'), r: val(value, href, 'r'), u: val(value, href, 'u'), d: val(value, href, 'd') });
  const setCell = (href: string, k: keyof PagePerm, on: boolean) => onChange({ ...value, [href]: { ...cellOf(href), [k]: on } });
  const setModuleOp = (hrefs: string[], k: keyof PagePerm, on: boolean) => {
    const next = { ...value };
    for (const h of hrefs) next[h] = { ...cellOf(h), [k]: on };
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end pr-3 text-2xs font-semibold text-muted2">
        {OPS.map((o) => <span key={o.k} className="w-14 text-center" title={o.title}>{o.label}</span>)}
      </div>
      {MODULE_GROUPS.map((g) => {
        const hrefs = g.items.map((i) => i.href);
        const expanded = open[g.key] ?? false;
        const fullN = hrefs.filter((h) => OPS.every((o) => val(value, h, o.k))).length;
        const noneN = hrefs.filter((h) => OPS.every((o) => !val(value, h, o.k))).length;
        const access = fullN === hrefs.length ? 'Full' : noneN === hrefs.length ? 'None' : 'Partial';
        const badge = access === 'Full' ? 'bg-emerald-500/10 text-emerald-600' : access === 'None' ? 'bg-surface2 text-muted2' : 'bg-amber-500/10 text-amber-600';
        return (
          <div key={g.key} className="rounded-lg border border-line">
            <div className="flex items-center justify-between gap-2 px-3 py-2.5">
              <button type="button" onClick={() => setOpen((p) => ({ ...p, [g.key]: !p[g.key] }))} className="flex items-center gap-2 min-w-0 text-left flex-1">
                <Icon name="ti-chevron-down" className={`text-xs text-muted2 transition-transform shrink-0 ${expanded ? '' : '-rotate-90'}`} />
                <Icon name={g.icon} className="text-sm text-muted2 shrink-0" />
                <span className="text-sm font-medium text-content truncate">{g.label}</span>
                <span className="text-2xs text-muted2 shrink-0">{g.items.length}</span>
                <span className={`text-2xs px-1.5 py-0.5 rounded-full shrink-0 ${badge}`}>{access}</span>
              </button>
              <div className="flex items-center shrink-0">
                {OPS.map((o) => {
                  const on = hrefs.map((h) => val(value, h, o.k));
                  const all = on.every(Boolean); const any = on.some(Boolean);
                  return <span key={o.k} className="w-14 flex justify-center"><TriCheck checked={all} indeterminate={any && !all} disabled={disabled} title={`${o.title} — whole ${g.label} module`} onChange={(v2) => setModuleOp(hrefs, o.k, v2)} /></span>;
                })}
              </div>
            </div>
            {expanded && (
              <div className="border-t border-line divide-y divide-line">
                {g.items.map((i) => (
                  <div key={i.href} className="flex items-center justify-between gap-2 px-3 py-1.5">
                    <span className="flex items-center gap-2 min-w-0 text-sm text-content pl-5">
                      <Icon name={i.icon} className="text-sm text-muted2 shrink-0" />
                      <span className="truncate">{i.label}</span>
                    </span>
                    <div className="flex items-center shrink-0">
                      {OPS.map((o) => (
                        <span key={o.k} className="w-14 flex justify-center">
                          <input type="checkbox" disabled={disabled} title={o.title} checked={val(value, i.href, o.k)} onChange={(e) => setCell(i.href, o.k, e.target.checked)} className="accent-accent w-4 h-4" />
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <p className="text-2xs text-muted2">Check a module row&apos;s Create / View / Edit / Delete to apply it to every page in that module, then fine-tune any page. Each module shows <strong>Full</strong>, <strong>Partial</strong> or <strong>None</strong>. Unchecking <strong>View</strong> hides a page from the sidebar and search.</p>
    </div>
  );
}

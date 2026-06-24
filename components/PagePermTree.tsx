import { useState } from 'react';
import { Icon } from '@/components/ui';
import { MODULE_GROUPS } from '@/lib/nav';
import { PagePerms, PagePerm } from '@/lib/supabase';

// #roles-crud — collapsible module->page matrix with Create/Read/Update/Delete per page.
// `module` = a sidebar menu group (Work, People, ...); rows = its pages. An absent cell
// defaults to allowed (true), matching the resolver in lib/entitlements.

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

export default function PagePermTree({ value, onChange, disabled }: { value: PagePerms; onChange: (next: PagePerms) => void; disabled?: boolean }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const cellOf = (href: string): PagePerm => ({ c: val(value, href, 'c'), r: val(value, href, 'r'), u: val(value, href, 'u'), d: val(value, href, 'd') });
  const setCell = (href: string, k: keyof PagePerm, on: boolean) => {
    const cur = cellOf(href); cur[k] = on;
    onChange({ ...value, [href]: cur });
  };
  const setMany = (hrefs: string[], on: boolean) => {
    const next = { ...value };
    for (const h of hrefs) next[h] = { c: on, r: on, u: on, d: on };
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
        const allOn = hrefs.every((h) => OPS.every((o) => val(value, h, o.k)));
        return (
          <div key={g.key} className="rounded-lg border border-line">
            <div className="flex items-center justify-between gap-2 p-2.5">
              <button type="button" onClick={() => setOpen((p) => ({ ...p, [g.key]: !p[g.key] }))} className="flex items-center gap-2 min-w-0 text-left flex-1">
                <Icon name="ti-chevron-down" className={`text-xs text-muted2 transition-transform shrink-0 ${expanded ? '' : '-rotate-90'}`} />
                <Icon name={g.icon} className="text-sm text-muted2 shrink-0" />
                <span className="text-sm font-medium text-content truncate">{g.label}</span>
                <span className="text-2xs text-muted2 shrink-0">{g.items.length}</span>
              </button>
              <button type="button" disabled={disabled} onClick={() => setMany(hrefs, !allOn)} className="btn-ghost text-2xs shrink-0">{allOn ? 'Clear' : 'All'}</button>
            </div>
            {expanded && (
              <div className="border-t border-line divide-y divide-line">
                {g.items.map((i) => (
                  <div key={i.href} className="flex items-center justify-between gap-2 px-3 py-1.5">
                    <span className="flex items-center gap-2 min-w-0 text-sm text-content">
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
      <p className="text-2xs text-muted2">Leave <strong>View</strong> unchecked to stop this role or user seeing a page (it disappears from the sidebar and search, combined with module access). Create, Edit and Delete are enforced per module as they roll out.</p>
    </div>
  );
}

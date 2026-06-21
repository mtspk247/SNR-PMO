# SNR-PMO — Global List System (single source of truth + backlog)

> The list/table experience for **every** module. Agreed standard: ONE centralized
> system applied to **all existing pages AND every new page/feature**. Tracked here
> + agent memory (`snr-pmo-clickup-list-system`) + the task list.

## Principle — never hand-build a list table again
- **components/ListView.tsx** — shell: toolbar (search/filters/columns drag+show-hide), group-by, multi-select bulk bar (Export + RBAC-gated Delete + custom actions), loading/empty.
- **components/DataList.tsx** — rows: grouped cards + per-group column header + bordered hover rows + inline cell editing. Matches the Tasks page look.
- **components/ListToolbar.tsx** (`useListPrefs`) — per-user persisted columns (drag-reorder + show/hide) + search + filters.
- **components/RowSelection.tsx** — multi-select (hover-reveal + full-row highlight) + BulkBar.
Theme-token styled → tenant skins restyle all lists automatically. One file change → propagates everywhere on deploy. New pages inherit the UX by rendering `<ListView/>`.

## DONE — live in production
- [x] Customizable columns (drag-reorder + show/hide, per-user persisted)
- [x] Multi-row selection (hover-reveal checkbox + full-row highlight + BulkBar: Export CSV + admin Delete)
- [x] Group by status (collapsible) + None
- [x] Inline cell editing (saves via existing update fn → RLS/RBAC enforced)
- [x] Search + filters
- [x] Tasks-matching visual (group cards + column header + bordered hover rows)
- [x] Rolled to ~30 modules

## BACKLOG — build order
Batch 1 (look like Tasks): B1.1 status pill-dropdown · B1.2 priority signal-bars · B1.3 assignee avatars
Batch 2 (deep): B2.1 "+ Add column / custom field" from list, RBAC-gated
Batch 3 (interactions): B3.1 drag row reorder + between status groups · B3.2 per-group "+ Add"
Batch 4 (toolbar parity): B4.1 Sort control · B4.2 List/Board toggle everywhere · B4.3 bulk "assign to person/team"
Later: L.1 subtask/row nesting · L.2 per-module custom Statuses manager

## Status log
- 2026-06-20 — Global system LIVE (96c6766); Tasks-match restyle LIVE (17c3ae6); deployment verified READY. Batch 1 next.

## ClickUp parity — full capture (2026-06-20, after Tariq's row/column feedback)
Reference = ClickUp List view (what.NGO screenshot). Honest status of EVERY element:

**DONE (shared DataList `4807969`) — lands on every ListView page:**
- [x] Plain **borderless** rows (no boxed card, no heavy row borders, no shadow-lift) — highlight on hover only
- [x] Left **6-dot grip handle** → drag rows up/down to reorder (persisted per-user via `orderKey`) AND across status groups (changes status via the normal update fn)
- [x] **Draggable column headers** → reorder left↔right (in-table, not just the menu)
- [x] **"+ add column"** from the header row (admin/RBAC)
- [x] Per-group repeated column header; collapsible groups; per-group "+ Add"; hover-reveal select checkbox; inline status/priority/avatar/text/date/number cells; colored status pill group header (when the page supplies pill colors)

**STILL MISSING / NOT YET GLOBAL (the real backlog):**
- [ ] **CONSISTENCY — migrate the divergent pages onto the shared system.** Ideas, Teams, CRM pipeline, Leads, Workload each still render their OWN toolbar/rows (ViewControls / bespoke) → they don't match. This is the #1 fix. (one owner per page, supervisor-verified)
- [ ] **Subtasks / row nesting** — the expand chevron + "Create subtask" (L.1). Needs a parent_id per entity + indent UI.
- [ ] **`orderKey` on every page** (persisted reorder) — currently only Clients; thread it through each ListView page.
- [ ] **Colored pill group headers everywhere** — ensure every grouped page passes `pill` colors (some pass plain labels → grey text).
- [ ] **Per-group "…" menu** — collapse-all / rename status / manage from the group header.
- [ ] **Saved named views** (per-user) — ClickUp "Save view"; we persist columns but not named view presets.
- [ ] **View tabs** (List / Board / Calendar / Activity) as ClickUp-style tabs; today only List/Board toggle.
- [ ] **Richer generic cells** — progress-bar (Completion Rate), time-tracked widget — as reusable cell renderers.
- [ ] **Row-hover quick actions** (tag / link / comment) on the right.

**Next slice:** make it TRULY global — migrate Ideas, Teams, CRM, Leads, Workload onto ListView/DataList so toolbar + rows are identical, then roll `orderKey` + pill colors to all.

## Status log (cont.)
- 2026-06-20 — **ClickUp row/column model LIVE** (`44aaa5c`, READY): plain borderless rows + hover highlight, left 6-dot grip → drag rows up/down (persisted via `orderKey`, Clients wired) + across status groups, draggable column headers (reorder), "+ add column" in header. Shared DataList → every ListView page. Also: toolbar unified (`b1b521b`), Ideas double-group removed (`01acfa8`).
- OPS GOTCHAS this batch: (1) `[id,i]` in `new Map(...)` infers `(string|number)[]` not a tuple → annotate `as [string,number]` (esbuild parse can't catch; tsc fails the Vercel build). (2) A no-count `str.replace` of `onAddInGroup={p.onAddInGroup}\n />` hit BOTH the Board AND DataList call sites → added `orderKey` to Board (no such prop) → build fail at ListView:154. ALWAYS check for a second identical call site when injecting a prop. (3) Vercel build logs > token cap → saved to file; `grep "Type error"` it.
- STILL DIVERGENT (next slice): Ideas, Teams, CRM, Leads, Workload don't use ListView → migrate them so toolbar+rows match everywhere.

## Divergent-page migration (2026-06-20)
- [x] **Leads → ListView** (`69aa607`, READY): now identical to Clients (unified toolbar + ClickUp rows/grip/column-drag/persisted reorder). Removed bespoke ListToolbar + manual Status/None toggle.
- [x] **Teams (List view)** — ALREADY on ListView (has a Cards/List toggle; List = ListView). No change needed.
- [x] **CRM → Contacts tab** — ALREADY on ListView. No change needed.
- [ ] **Ideas** — List view uses the rebuilt DataList (rows already match) but keeps a ViewControls **Cards** view + multi-dimension group (status/project/author). Full ListView = lose Cards + project/author grouping.
- [ ] **CRM → Pipeline tab (deals)** — bespoke kanban + per-stage $ value sums in group headers. Full ListView = lose the $ rollups.
- [ ] **Workload** — analytics AGGREGATION table (progress bars, Person/Team/Project rollups), not a record list. Not a natural ListView fit.
DECISION NEEDED (don't silently delete features): force Ideas/Pipeline/Workload onto the standard list (losing Cards / $ stage-sums / analytics layout), OR keep their special views as-is. The standard record lists are now uniform.

## ClickUp parity batch 2 (2026-06-21) — LIVE
- [x] **Custom field types** (`3965e13`): "+ Add column" offers Text/Long text/Number/Money/Progress bar/Rating/Date/Checkbox/Dropdown/Labels/Website/Email/Phone + options input (Dropdown/Labels). Type-aware cell rendering. Shared AddColumnForm. DB CHECK relaxed (migration custom_field_types_expand).
- [x] **Inline assignee/owner picker** (`f4e21ee` + `bedec40`): new 'person' inline-edit type — avatar + searchable people dropdown, set owner in-row. LIVE on 7 pages: Clients, Leads, Applications, Assets, Bank-accounts, Recurring, Domains.
- [x] **Realtime drag** (`ce45a48`): pointer-based floating chip sticks to cursor, live drop highlight. Shared lists.
- [x] **Borderless rows** on Tasks + Pipeline (`8fd0f99`).
REMAINING:
- [ ] Assignee picker on contracts/proposals/jobs/subscriptions (DataList-direct, need editable/rawValue/onEdit added).
- [ ] Tasks + Pipeline: adopt shared grip-drag + in-header column drag-and-drop (bespoke row markup).
- [ ] Subtasks (parent_id), saved views, more field types (Formula/Files/People/Relationship).

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


## 2026-06-25 — Agents: Support agent "Find work" (SHIPPED)
- `lib/agentScanner.ts`: deterministic scanner extended to **support** (was accounting/tasks/crm/people) — round-robin-assigns unassigned, non-terminal tickets to active support staff → `triage_ticket` (existing executor; `assignTicket` RPC enforces support-staff; reversible by unassigning). `runWorkScan` fetches `listTickets` + `supportAgentList` (active), dedupes by `ticket_id`. Pure-scanner unit test 10/10; **no new DB objects/write paths**. `/docs#agents`. Preview `e4d070a` READY → merged main. Lights up the Support agent's "Find work in my data" button (works without an LLM key).

## 2026-06-25 — Agents: CRM agents now CREATE contacts + deals (SHIPPED)
- `lib/agentExecutors.ts`: `create_contact` (low/reversible) + `create_deal` (medium/reversible) executors — run client-side as the approver via `createContact`/`createDeal` (same RLS path a human uses; reversible by delete). `lib/agents.ts` catalog + SAMPLE_PROPOSALS + Pipeline Mover starter; `/docs#agents`. **No new DB objects.** RLS-sim: same-org INSERT allowed, cross-tenant denied (42501) on crm_contacts/crm_deals (`is_org_member` + crm feature + non-guest wall). Preview `d42fe10` READY → merged main. Answers Tariq's "agents feel like automations" critique (depth backlog #2).

## 2026-06-25 — Command palette (SHIPPED)
- `components/GlobalSearch.tsx`: Cmd/Ctrl-K + "/" jump to any page (nav manifest → "Jump to" group) + quick-create **Actions** (New client/lead/invoice/form/booking/note/expense) above record results; hidden-page aware; unified keyboard nav. Commits `2a438d2` + `3a3e8ee`, both preview-READY → main.

## 2026-06-25 — Drive collaboration: sheets + slides + private realtime channel (SHIPPED — closes the deferred items)
- Real-time collaborative SPREADSHEETS (`281c5d9` Yjs grid + safe formula engine `57f261d`) + PRESENTATIONS (`a16c1e4` Yjs slides + drag-reorder) on the same SupabaseProvider substrate; doc tables (`57f261d`). Security: `drive_doc:<id>` Realtime channel made PRIVATE + `realtime.messages` RLS (`89840d8`). All "DEFERRED (open)" items from the foundation entry below are now done.

## 2026-06-25 — Drive collaboration: Real-time editing + Granular permissions + Comments/Tagging (SHIPPED)
- Migration `drive_collab_foundation` (expand-only; RLS-sim allow/deny/cross-tenant + no-regression PASS; advisors clean): `drives.restricted`, `drive_files.doc_state`, `drive_grants`, `drive_comments`, `drive_comment_mentions`, `drive_level()`/`drive_can()` resolver, `drive_comment_add()` RPC (commenter+ gate, payload caps, mention notifications).
- App: `lib/yProvider.ts` (custom Yjs provider over Supabase Realtime broadcast+presence — no extra server, up to 50 users), `components/CollabDocEditor.tsx` (TipTap+Yjs live document editor, presence avatars, live cursors, debounced autosave, level-gated), `components/DriveShareModal.tsx` (restrict + per-person Viewer/Commenter/Editor), `components/DriveComments.tsx` (threaded comments + @mention autocomplete). `lib/db.ts` data layer; `pages/drives.tsx` wired; `/docs#drives` updated. New deps: yjs, @tiptap/*, y-prosemirror, y-protocols.
- Verified: Vercel preview build READY at commit 67e40ef before merge to main.
- DEFERRED (open): collaborative SPREADSHEETS + PRESENTATIONS on the same substrate (documents proved the engine). Security follow-up: make the `drive_doc:<id>` Realtime channel private + add `realtime.messages` RLS (DB content already RLS-walled; broadcast carries only CRDT diffs).

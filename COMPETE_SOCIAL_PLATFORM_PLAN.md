# Social Media Management — Best-in-Market Build Plan (SNR-PMO)

> **Goal.** A complete, best-in-class social media management + analytics suite, deeply wired into ABOS (agents), RBAC and RLS — that doesn't just match Hootsuite / Buffer / Sprout Social / Later / Sprinklr / Agorapulse, but **steps ahead** by being AI-native (agents do the work), white-label (resellers ship it as their own), and part of one back-office (PMO + CRM + accounting + social in one tenant).

## 1. Competitive landscape (what "best" means)

| Capability | Buffer | Later | Hootsuite | Sprout Social | Sprinklr | **SNR-PMO target** |
|---|---|---|---|---|---|---|
| Multi-channel publish/schedule | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (FB/IG/LinkedIn/X/YouTube/TikTok/Threads/Pinterest/GBP) |
| Visual content calendar | ✓ | ✓✓ | ✓ | ✓ | ✓ | ✓ + drag-reschedule |
| Analytics & reporting | basic | ✓ | ✓ | ✓✓ | ✓✓ | ✓✓ **+ per-tenant, exportable, white-label** |
| Unified inbox (replies/DMs/mentions) | – | – | ✓ | ✓✓ | ✓✓ | ✓ (ties into existing SMS/Inbox substrate) |
| Approval workflows | team | ✓ | ✓ | ✓✓ | ✓✓ | ✓ **via RBAC + ABOS approve-first** |
| AI assist (draft/repurpose/best-time) | add-on | ✓ | ✓ | ✓ | ✓ | ✓✓ **agents as the content team (native, approve-first)** |
| Social listening | – | – | ✓ | ✓✓ | ✓✓ | Phase 5 |
| Team/roles/permissions | basic | ✓ | ✓ | ✓✓ | ✓✓ | ✓✓ **per-page CRUD RLS/RBAC we already have** |
| White-label / resell | – | – | limited | – | enterprise | ✓✓ **native (reseller feature control + branding)** |
| Price posture | low | mid | high | high | very high | **bundled into the ops platform (no per-seat social tax)** |

**Our three unfair advantages:**
1. **AI-native (ABOS).** Competitors bolt AI on; here agents *are* the content team — draft, (soon) schedule, analyze, and reply, all **approve-first**, all **as the approving user through RLS** (never a bypass).
2. **White-label + resell.** A reseller can turn social on/off per sub-tenant (already shipped: `reseller_set_sub_feature`) and ship it under their own brand/domain.
3. **One back-office.** Social sits next to CRM, projects, invoicing — a post can reference a campaign, a won deal, a client. No other tool has the whole operation in one tenant.

## 2. Pillars & status

| Pillar | What it is | Status |
|---|---|---|
| **P0 Substrate** | channels, posts, per-channel targets | ✅ Phase 3A (RLS, feature-gated, dark) |
| **P1 Composer/Scheduler** | write once, target channels, draft/schedule | ✅ Phase 3A |
| **P2 Agents (content team)** | `draft_social_post` into approve-first queue | ✅ Phase 3B |
| **P3 Analytics** | reach/engagement/top-posts/per-channel/trend | ✅ **Phase 3C (this)** — substrate + RPCs + dashboard |
| **P4 Live publishing** | per-platform OAuth + scheduled dispatcher | ⏳ next (needs provider creds) |
| **P5 Engagement inbox** | replies, mentions, DMs → unified inbox | ⏳ (reuse SMS/Inbox substrate) |
| **P6 Content calendar** | month/week visual, drag-reschedule | ⏳ |
| **P7 Approvals workflow** | content approval gates (RBAC) | ⏳ |
| **P8 AI assist+** | best-time, hashtag/variant, repurpose, `analyze_social_performance` agent | ⏳ |
| **P9 Listening** | keyword/brand monitoring | later |

## 3. Data model (snrpmo)

- **`social_channels`** — connected accounts (platform, handle, status, tokens live in a *separate secrets table*, never here).
- **`social_posts`** — content (body, media, status draft/scheduled/published/failed/cancelled, scheduled_at, published_at, source manual/agent/automation).
- **`social_post_channels`** — per-channel fan-out (status, external_id, error) — one publish result per channel.
- **`social_post_metrics`** — per-post-per-channel performance (impressions/reach/likes/comments/shares/clicks/saves/video_views, generated `engagement`). *(Phase 3C)*
- **`social_channel_metrics`** — follower/growth snapshots (time-series). *(Phase 3C)*
- **P4:** `social_provider_config` (per-org OAuth tokens, **secrets-safe** like sms_config: no client read, definer getter/setter, spend/rate caps).
- **P5:** reuse `comms_messages`/inbound for social replies, or `social_conversations`/`social_messages`.

## 4. Security model (non-negotiable — applies to every pillar)

- **RLS is the wall.** Every social table: RLS-enabled, `is_org_staff` SELECT, **RESTRICTIVE `page_allows('/social', …)`** for per-page CRUD, **authenticated-only grants, anon revoked**. Verified via RLS-sim (allow/deny/cross-tenant/anon) + advisors, every slice.
- **Writes that aren't user-CRUD go through SECURITY DEFINER RPCs** with org derived from a trusted row (never caller input): metrics ingestion (`social_record_post_metrics`), publishing, token storage.
- **Agents never bypass.** Executors run **client-side as the approving user** via the same `db.ts` fns → bound by that user's RLS/RBAC. Approve-first; reversible; audited; cost-capped.
- **Money/abuse paths (P4 publish):** per-org + global **rate-limits** + **cost caps** + kill-switch (mirror the email/SMS breakers); provider secrets signature-verified; never auto-publish the user didn't queue.
- **Reseller isolation.** Feature on/off per sub-tenant (`reseller_set_sub_feature`); a reseller only ever touches its own sub-tenants.

## 5. Scalability, caching, rate-limits

- **Server-side aggregation RPCs** (`social_analytics_overview/_channel_stats/_top_posts/_engagement_trend`) — SECURITY INVOKER (RLS-scoped), hard `LIMIT`s (top-posts capped 100), indexed (`org_id`, `engagement desc`, `channel_id, collected_at`). No client-side scans.
- **Caching:** analytics reads are cache-friendly (Reload button / periodic); metrics are snapshot-upserted, not append-per-view. A future materialized daily rollup for very large tenants.
- **Publishing/metrics ingestion** run in an edge-function dispatcher on pg_cron (like sms-dispatch), **rate-limited per provider** and **cost-capped**, fail-closed on cap/outage.

## 6. ABOS integration (the moat)

- **Draft** — `draft_social_post` (✅ shipped): agent proposes post text → approve-first → draft into composer.
- **Analyze** — `analyze_social_performance` (next): reads `social_post_metrics`, drafts an insights note (top content, best channel/time, recommendations). Read-only/reversible.
- **Reply** — `draft_social_reply` (P5): agent drafts responses to comments/DMs; human approves before send.
- **Optimize** — best-time-to-post + hashtag/variant suggestions from the analytics the agent can see.
- Every agent action: approve-first, as-the-user (RLS), reversible, audited, cost-capped — same ABOS guarantees as the rest of the platform.

## 7. Rollout

Ships **dark** (`feature_rollouts` stage `internal`) → expand cohort-by-cohort. Plan-gated (`social` feature) + reseller-curatable. Docs in `/docs#social` (single source) + SYSTEM_GUIDE, contextual `help="social"` on every page.

*Keep this current: check pillars off as they land; record any security/scale lesson here.*

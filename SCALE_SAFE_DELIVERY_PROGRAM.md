# SCALE & SAFE-DELIVERY PROGRAM

> Durable backlog for scaling to many tenants without crashing, defending against abuse/cost,
> and shipping changes without blast radius. Phased; check items off as they land. Pairs with
> ARCHITECTURE_AND_SCALABILITY_MANDATE.md (how) + SECURITY_AND_TESTING_MANDATE.md (security gate).
> Last updated 2026-06-29.

## Baseline (2026-06-29)
- DB: single Supabase Postgres 17 primary, region ap-southeast-1 (Singapore). No read replica, no staging project.
- App: Vercel, `main` auto-deploys to ALL tenants. Per-branch preview builds (tsc/lint) + verify-before-deploy.
- Strong floor already: RLS+RBAC every table, anon rate-limiting, per-tenant cost caps (agent_cost_check),
  file malware-scan gate, FK covering indexes, expand->contract migrations, secret-scanning CI.
- Gaps this program closes: no staged rollout, no staging DB, test gate not merge-blocking (tsc/lint/unit-tests now green; no branch protection),
  no network WAF/DDoS, no global cost circuit-breaker, pooling unverified, leaked-password protection off.

## P1 - Progressive delivery (release without blast radius)  [IN PROGRESS]
- [x] Rollout foundation (migration `feature_rollout_foundation`, commit ce674a8): `feature_rollouts` +
      `feature_rollout_tenants` + `feature_rolled_out()` resolver + `org_dark_features()` RPC. Stages
      off->internal->beta->percent->ga; all current features backfilled GA (zero behavior change);
      client subtracts dark features in pages/_app.tsx (fail-open: errors never hide a paid feature).
      Sim-verified across every stage.
- [x] Admin UI: /platform "Feature rollout" tab — per-feature stage (off/internal/percent/ga) + percent; `platform_set_feature_rollout` RPC (admin-gated, fail-closed). Shipped deaec9a. (Beta per-tenant allowlist UI = fast-follow.)
- [ ] Propagation: /docs section; update CLAUDE.md feature-change rule (new feature => register a feature_rollouts row, default `off`).
- [ ] (later, gated) Server-enforce: AND rollout into tenant_can for defense-in-depth (high blast radius).
- NOTE: this is FEATURE rollout. Staged CODE-change rollout needs P3 (test gate) + P4 (staging) + Vercel canary.

## P2 - Cost / abuse circuit-breaker ("a big hit = a runaway bill")
- [x] Coverage audit: AI/agents (`agent_cost_check`+`agent_cost_limits`), SMS (`monthly_cap_usd`), storage (`drive_usage`/quota) were already capped. EMAIL was the open path.
- [x] Email circuit-breaker SHIPPED (`7272ea3`, migration `email_cost_circuit_breaker`): global pause kill-switch + global daily cap + per-tenant monthly cap, enforced at `email_claim_batch`; /platform Email "Sending limits" UI; admin-gated RPCs; RLS-sim'd. Over-cap mail stays queued, not dropped.
- [ ] Spend ALERTS for email/sms/agents (extend `check_usage_alerts` with an 'email' metric — the 80/90/100% machinery already exists).
- [ ] Unified "Cost & limits" dashboard (one view of every cap + current usage) + a global aggregate breaker across tenants.
- [ ] Stripe money paths: signature-verify + idempotency + server-computed amounts (when live billing turns on).

## P3 - Real test gate (stop broken code reaching prod)
- [x] **CI gate green & accurate** (`fe5fad4`): `next.config` ignore flags were already OFF and tsc/lint are clean (no 37-tsc backlog — memory `snr-pmo-ci-gate` corrected). The red `Unit tests` job is fixed (harness-only `globalThis.WebSocket` stub in the test bundle); typecheck+lint+unit-tests now pass on every push/PR.
- [ ] **Make the gate merge-blocking:** enable branch protection on `main` (required status checks = `CI (enforced gate)` + `Security`). Currently green but NOT required (no protection) → a red gate would not block. NOTE: this moves deploys from direct `sha→main` to PR-merge.
- [ ] Playwright smoke/e2e against the preview URL; wire the RLS-sim suite into CI as required-green before merge to main.

## P4 - Staging environment (needs a billing decision)
- [ ] 2nd Supabase project OR paid DB branching + a Vercel staging target seeded with demo data.
- [ ] Migrate-on-staging-first workflow; promote to prod only after staging is green. (Removes "migrations hit live prod".)

## P5 - Scale hardening
- [ ] Verify EVERY server path uses the Supavisor transaction pooler (the #1 connection ceiling at scale).
- [ ] Consolidate ~125 duplicate permissive RLS policies (per-table, RLS-sim each) - direct throughput.
- [ ] Drop confirmed-safe unused indexes (~135 flagged) to keep writes lean.
- [ ] pg_stat_statements + slow-query visibility; fix the top-10 queries. Read-replica plan when reads dominate.

## P6 - Edge / auth / recovery
- [ ] Cloudflare or Vercel WAF + bot/DDoS rules on public endpoints (form_submit, api-v1, booking, signup). Needs DNS.
- [ ] Enable Auth leaked-password protection + admin MFA + auth rate-limits.
- [ ] Confirm PITR enabled; run a REAL restore drill (an untested backup is not a backup).

## Sequencing rationale
P1 first - cheapest, fully in our control, and once it exists every later feature ships behind it. P2 caps the
financial-DoS vector. P3 makes every future change safer. P4 removes the live-prod-migration risk. P5/P6 are
continuous tracks. Parallelize independent slices only when they own disjoint files (AGENT_ORCHESTRATION_PLAYBOOK).

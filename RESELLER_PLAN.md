# Reseller / Multi-level Tenancy — Build Plan

> Goal: let a (white-label) tenant become a **Reseller** that creates, brands, plans and bills its **own** sub-tenants. Model: **Platform → Reseller → Sub-tenant**. White-label is the prerequisite; reselling is the structural layer on top.

## Current state
Single-level **Platform → Tenants**. `org_members` per org; `platform_admins` for cross-tenant ops. Per-tenant white-label exists (custom domain, host branding, branded emails). No org hierarchy, no reseller scoping, no billing splits. `SNR` is the platform-home root (never a sub).

## Target model
- `organizations.parent_org_id` (nullable, self-FK) — a sub-tenant's reseller.
- `organizations.is_reseller` (bool) — a tenant designated as a reseller (gated by a `reseller` plan feature).
- A reseller gets a **console scoped to its own children only** (a mini-/tenants).

## Stage 0 — Decisions that gate everything
1. **Billing model** (biggest fork):
   - **v1 (recommended): wholesale.** Platform bills the reseller (e.g. per active sub-tenant or per seat on an Agency/White-label plan). The reseller bills their own clients **off-platform**. No money movement, no PCI/Connect scope, ship fast.
   - **v2 (later): Stripe Connect split.** Platform collects from each sub-tenant and splits revenue to the reseller. Powerful but heavy compliance/payout/tax scope.
2. **Branding cascade:** sub-tenants inherit the reseller's branding by default, overridable per sub. (Recommended: yes.)
3. **Entitlement caps:** a reseller can only grant sub-tenants features/seats within its own wholesale entitlement.
4. **Feature key:** add `reseller`, gated to the White-label/Agency plan.

## Stages (each independently shippable)
- **Stage 1 — Foundation (non-breaking):** add `parent_org_id` + `is_reseller`; add `reseller` feature to catalog + plan matrix (White-label plan); platform-admin can flag a tenant as reseller. No behaviour change yet. *(~1 migration + small UI.)*
- **Stage 2 — Reseller console + RLS (highest risk):** reseller owner/admin can list/create/manage orgs where `parent_org_id = their org`; new SECURITY-DEFINER RPCs (`reseller_list_orgs`, `reseller_create_tenant`, `reseller_invite_owner`) all scoped to `is_reseller` + parent. Careful, audited RLS so no cross-tenant leak. A `/reseller` area (or `/tenants` filtered to children).
- **Stage 3 — Branding cascade:** sub-tenants inherit reseller logo/colors/domain by default; `useHostBranding` resolves the reseller brand for sub custom domains; per-sub override.
- **Stage 4 — Entitlement caps:** reseller's wholesale plan defines the max it can grant; a sub's effective features = min(reseller cap, assigned plan).
- **Stage 5 — Billing v1 (wholesale):** roll up child count/seats → the reseller's invoice (reuse existing billing). Reseller bills clients off-platform.
- **Stage 6 — Ops/visibility:** platform console shows the hierarchy + reseller-level usage; reseller "view as sub" reuses the audited impersonation; all reseller actions audited.
- *(Stage 7 — Stripe Connect split: optional, separate project.)*

## Cross-cutting risks
- **RLS is the danger zone.** Every tenant table scopes by membership today; granting a reseller read/manage on its children must be done with explicit, audited policies (and ideally via RPCs, not broad table policies) to avoid cross-tenant data leaks. This is where most of the care goes.
- **Money movement** (Connect) — defer to v2.
- **Platform-home (SNR)** is the root and can never be a sub or a reseller's child.

## Recommended sequence
Stage 0 (decide) → 1 → 2 → 3 → 4 → 5. Ship each thin slice; never big-bang. First buildable slice = **Stage 1 foundation** (safe, non-breaking).

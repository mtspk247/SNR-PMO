/**
 * Data for the programmatic /vs/<competitor> SEO comparison pages.
 * Pure data — no React, no app deps. Facts reflect each product's primary
 * positioning and publicly documented capabilities as of June 2026 (hedged);
 * marks are kept consistent with the landing #compare matrix.
 *
 *   y = included        p = partial / limited / add-on        n = not offered
 */

export type Mark = 'y' | 'p' | 'n';

export interface CompareRow {
  c: string;            // capability label
  snr: Mark;            // SNR-PMO
  them: Mark;           // competitor
  note?: string;        // short qualifier shown under the row
}

export interface Competitor {
  slug: string;                 // /vs/<slug>
  name: string;                 // display name
  positioning: string;          // one-line category
  keywords: string[];           // extra search terms for meta keywords
  hero: string;                 // hero sub-headline
  metaTitle: string;
  metaDescription: string;
  verdict: string;              // honest TL;DR
  theyWin: string[];            // where the competitor is the better pick
  weWin: string[];              // where SNR-PMO wins
  rows: CompareRow[];
  pricingNote: string;          // hedged pricing snapshot
  faqs: { q: string; a: string }[];
}

export const COMPETITORS: Competitor[] = [
  {
    slug: 'gohighlevel',
    name: 'GoHighLevel',
    positioning: 'agency front-office & marketing CRM',
    keywords: ['GoHighLevel alternative', 'HighLevel alternative', 'GHL alternative', 'white-label SaaS', 'agency software'],
    hero: `GoHighLevel runs your agency's front office — funnels, campaigns and client CRM. SNR-PMO runs the back office those clients actually operate on: projects, HR & payroll, real accounting and approve-first AI agents — white-labeled and resold the same way.`,
    metaTitle: 'SNR-PMO vs GoHighLevel — the back-office alternative for agencies (2026)',
    metaDescription: `GoHighLevel vs SNR-PMO compared. GHL owns the marketing front office; SNR-PMO adds the operational back office — projects, HR & payroll, real double-entry accounting and approve-first AI agents — with the same white-label resale. Honest, side-by-side capability comparison.`,
    verdict: `GoHighLevel is the category leader for marketing agencies: funnels, pipelines, campaigns and white-label SaaS resale. But it stops at the front office — there's no real project/PMO layer, no HR or payroll, and no double-entry accounting, so your clients still run operations elsewhere. SNR-PMO is the back-office counterpart: the same "sell it as your own" white-label model, but for projects, people and the books, with approve-first AI agents doing the busywork. If you sell marketing services, GHL is hard to beat; if you or your clients need to actually run operations and finances, SNR-PMO covers what GHL doesn't.`,
    theyWin: [
      `Marketing funnels, a landing-page/website builder and email/SMS campaign automation are GHL's core and more mature than ours.`,
      `Front-office conversation AI and booking bots for lead capture and appointment setting.`,
      `A large agency ecosystem with snapshots, templates and a community marketplace.`,
    ],
    weWin: [
      `Real project & portfolio management (task to portfolio), not just sales pipelines.`,
      `HR & payroll and a genuine double-entry general ledger in the same workspace — GHL has neither.`,
      `Approve-first AI agents that act on back-office data (tasks, journal entries, onboarding, follow-ups) with a full audit trail and one-click rollback.`,
      `One product, one bill for the whole operation instead of bolting on separate ops and finance tools.`,
    ],
    rows: [
      { c: 'Projects & PMO (task to portfolio)', snr: 'y', them: 'n' },
      { c: 'CRM & sales pipeline', snr: 'y', them: 'y' },
      { c: 'Marketing funnels & campaign builder', snr: 'p', them: 'y', note: `GHL's strength; SNR-PMO has email campaigns + tracking, not a funnel builder` },
      { c: 'HR & payroll', snr: 'y', them: 'n' },
      { c: 'Real double-entry accounting', snr: 'y', them: 'n' },
      { c: 'Approve-first AI agents (back office)', snr: 'y', them: 'n', note: `GHL's AI is front-office (conversations, booking)` },
      { c: 'White-label & resell (multi-tenant)', snr: 'y', them: 'y' },
      { c: 'One product, one bill', snr: 'y', them: 'p', note: 'GHL covers the front office; back-office tools are separate' },
    ],
    pricingNote: `GoHighLevel publishes three plans — roughly $97/mo (Starter), $297/mo (Unlimited) and $497/mo (the Agency/SaaS Pro tier that unlocks white-label SaaS resale). Pricing as of June 2026; check gohighlevel.com for current plans.`,
    faqs: [
      { q: 'Is SNR-PMO a GoHighLevel alternative?', a: `It's both a complement and an alternative, depending on your need. GoHighLevel owns the marketing front office; SNR-PMO owns the operational back office — projects, HR, payroll and real accounting — with the same white-label resale model. Agencies that need to run operations, not just marketing, choose SNR-PMO.` },
      { q: 'Can I white-label and resell SNR-PMO like a GHL SaaS?', a: `Yes. On the White-label plan you apply your own brand, logo and custom domain and provision and bill unlimited client sub-accounts from a reseller console — the same "sell it as your own" model, but for back-office operations.` },
      { q: 'Does SNR-PMO do funnels and campaigns like GoHighLevel?', a: `SNR-PMO has email campaigns with open/click tracking and scheduling, but it is not a funnel or landing-page builder — that is GHL's strength. SNR-PMO's focus is the operations and finances behind the funnel.` },
      { q: 'How is SNR-PMO’s AI different from GoHighLevel’s?', a: `Both have AI, aimed differently. GHL's AI is front-office (conversations, booking). SNR-PMO's agents work the back office — drafting tasks, journal entries, onboarding and follow-ups — and every action is approve-first, audited and reversible.` },
    ],
  },

  {
    slug: 'clickup',
    name: 'ClickUp',
    positioning: 'project & work management',
    keywords: ['ClickUp alternative', 'project management software', 'all-in-one work management', 'ClickUp vs'],
    hero: `ClickUp is a powerful project-management workspace. SNR-PMO matches the projects-and-tasks core, then adds what ClickUp doesn't do — HR & payroll, real double-entry accounting, white-label resale and approve-first AI agents — so your whole back office lives in one place.`,
    metaTitle: 'SNR-PMO vs ClickUp — projects plus the rest of your back office (2026)',
    metaDescription: `ClickUp vs SNR-PMO compared. ClickUp is excellent at project management; SNR-PMO adds a real CRM, HR & payroll, double-entry accounting, white-label resale and approve-first AI agents in one workspace. Honest, side-by-side comparison.`,
    verdict: `ClickUp is one of the most flexible project- and work-management tools available, with deep customization, docs and views. If pure project management is all you need, it is excellent. But ClickUp is not a business OS: there is no payroll or real accounting, CRM is something you assemble from custom fields, and white-labeling is limited to top Enterprise agreements. SNR-PMO gives you a strong PMO core plus a real CRM, HR & payroll, double-entry books and white-label resale — unified, with approve-first AI agents on top.`,
    theyWin: [
      `Best-in-class flexibility: views, custom statuses, docs, whiteboards and a very deep free tier.`,
      `A large integrations marketplace and mature, polished mobile apps.`,
      `More project/task view types and document tooling out of the box than most all-in-one suites.`,
    ],
    weWin: [
      `A real CRM pipeline, HR & payroll and double-entry accounting — none of which ClickUp does natively.`,
      `White-label and multi-tenant resale on a standard plan, not only on Enterprise.`,
      `Approve-first AI agents that act on your data with an audit trail and one-click rollback (ClickUp's AI is content/assist-oriented).`,
      `One product, one bill for projects, people and finances together.`,
    ],
    rows: [
      { c: 'Projects & PMO (task to portfolio)', snr: 'y', them: 'y' },
      { c: 'Depth of views, docs & customization', snr: 'p', them: 'y', note: `ClickUp's strength; SNR-PMO is catching up with customizable lists & fields` },
      { c: 'CRM & sales pipeline', snr: 'y', them: 'p', note: 'ClickUp = built from custom fields, not a dedicated CRM' },
      { c: 'HR & payroll', snr: 'y', them: 'n' },
      { c: 'Real double-entry accounting', snr: 'y', them: 'n' },
      { c: 'Approve-first AI agents (back office)', snr: 'y', them: 'n' },
      { c: 'White-label & resell (multi-tenant)', snr: 'y', them: 'p', note: 'ClickUp: limited, Enterprise-only' },
      { c: 'One product, one bill', snr: 'y', them: 'n' },
    ],
    pricingNote: `ClickUp offers a Free Forever tier, Unlimited (~$7/user/mo) and Business (~$12/user/mo), with Enterprise pricing on request; white-labeling is an Enterprise-level capability. Pricing as of June 2026; see clickup.com.`,
    faqs: [
      { q: 'Is SNR-PMO a ClickUp alternative?', a: `Yes, for teams that want project management plus the rest of the back office. SNR-PMO covers projects and tasks, then adds CRM, HR & payroll and real accounting that ClickUp does not have.` },
      { q: 'Can I import my ClickUp data?', a: `Yes. Import projects, tasks and contacts via CSV, and use the org-scoped REST API for larger migrations. Most teams move their active work over in an afternoon.` },
      { q: 'Does SNR-PMO have ClickUp-style custom fields and views?', a: `SNR-PMO has a centralized, customizable list system with custom columns — including relationship, rollup, formula and AI fields. ClickUp still has more view types and document tooling; SNR-PMO trades some of that breadth for an all-in-one back office.` },
      { q: 'Does ClickUp do accounting or payroll?', a: `No. That is the main reason teams add or switch to SNR-PMO — real double-entry books and payroll in the same workspace as their projects.` },
    ],
  },

  {
    slug: 'odoo',
    name: 'Odoo',
    positioning: 'open-source ERP suite',
    keywords: ['Odoo alternative', 'ERP alternative', 'turnkey ERP', 'all-in-one business software', 'Odoo vs'],
    hero: `Odoo is a broad ERP with apps for almost everything — but it's a build-it-with-a-partner platform. SNR-PMO delivers the back-office essentials (projects, CRM, HR & payroll, real accounting) as turnkey SaaS, adds approve-first AI agents, and lets you white-label and resell it without an implementation project.`,
    metaTitle: 'SNR-PMO vs Odoo — turnkey back office vs ERP platform (2026)',
    metaDescription: `Odoo vs SNR-PMO compared. Odoo is a broad ERP usually deployed with a partner; SNR-PMO is turnkey multi-tenant SaaS with approve-first AI agents and white-label resale. Honest, side-by-side comparison of where each one wins.`,
    verdict: `Odoo is the most feature-complete competitor here — it genuinely has accounting, HR, payroll, CRM and projects. The trade-off is the model: Odoo is a modular ERP usually deployed and customized with a partner or in-house developers, app-by-app pricing adds up, and there are no approve-first AI agents. SNR-PMO is turnkey multi-tenant SaaS: one workspace, one bill, alive on day one, with AI agents doing back-office work — and you can white-label and resell it as your own, which Odoo's partner model isn't designed for. Choose Odoo for deep ERP customization with an implementer; choose SNR-PMO for fast, turnkey operations and white-label resale.`,
    theyWin: [
      `The broadest feature surface: manufacturing, inventory, e-commerce, POS and dozens of apps beyond the back-office basics.`,
      `Open-source core and near-unlimited customization if you have developers or an implementation partner.`,
      `A mature accounting suite with long-standing localization and tax coverage across many countries.`,
    ],
    weWin: [
      `Turnkey SaaS — every workspace lands alive in minutes, with no implementation project or partner required.`,
      `Approve-first AI agents on the back office (tasks, journal entries, onboarding, follow-ups) with audit + one-click rollback — Odoo has none.`,
      `True white-label resale with a reseller console and per-client billing, not a partner-referral arrangement.`,
      `One predictable bill instead of per-app pricing that grows as you add modules.`,
    ],
    rows: [
      { c: 'Projects & PMO (task to portfolio)', snr: 'y', them: 'y' },
      { c: 'CRM & sales pipeline', snr: 'y', them: 'y' },
      { c: 'HR & payroll', snr: 'y', them: 'y' },
      { c: 'Real double-entry accounting', snr: 'y', them: 'y' },
      { c: 'Broader ERP (inventory, MFG, POS, e-commerce)', snr: 'p', them: 'y', note: `Odoo's strength; SNR-PMO has products/inventory, not full ERP` },
      { c: 'Approve-first AI agents (back office)', snr: 'y', them: 'n' },
      { c: 'Turnkey SaaS (no implementation project)', snr: 'y', them: 'p', note: 'Odoo deployments typically need configuration/partners' },
      { c: 'White-label & resell (multi-tenant)', snr: 'y', them: 'p', note: 'Odoo = partner/implementer model, not turnkey resale' },
      { c: 'One product, one bill', snr: 'y', them: 'p', note: 'Odoo prices per app/module' },
    ],
    pricingNote: `Odoo has a free One-App plan, with Standard (~$24/user/mo) and Custom (~$38/user/mo) tiers billed per user; real-world deployments often add partner/implementation costs on top. Pricing as of June 2026; see odoo.com.`,
    faqs: [
      { q: 'Is SNR-PMO an Odoo alternative?', a: `Yes, for back-office operations delivered as turnkey SaaS. Odoo is broader but typically needs configuration and a partner; SNR-PMO is alive on day one and built to be white-labeled and resold.` },
      { q: 'Does SNR-PMO have real accounting like Odoo?', a: `Yes — a genuine general ledger with a chart of accounts, trial balance and P&L, where payroll runs and invoices post real journal entries.` },
      { q: 'Can I self-host SNR-PMO like Odoo Community?', a: `SNR-PMO is delivered as managed multi-tenant SaaS (including white-label/reseller hosting). Odoo's open-source self-host is a different model; SNR-PMO trades that for zero-ops and approve-first AI agents.` },
      { q: 'Which is faster to launch?', a: `SNR-PMO: a workspace is usable in minutes, optionally pre-seeded with sample data and a starter AI-agent team. Odoo typically involves an implementation phase before go-live.` },
    ],
  },

  {
    slug: 'hubspot',
    name: 'HubSpot',
    positioning: 'marketing & sales CRM',
    keywords: ['HubSpot alternative', 'CRM alternative', 'all-in-one CRM', 'HubSpot vs'],
    hero: `HubSpot is a leading marketing and sales CRM. SNR-PMO keeps a real CRM pipeline, then adds the operational back office HubSpot leaves out — projects, HR & payroll, real double-entry accounting and approve-first AI agents — and lets you white-label and resell the whole thing.`,
    metaTitle: 'SNR-PMO vs HubSpot — CRM plus the operational back office (2026)',
    metaDescription: `HubSpot vs SNR-PMO compared. HubSpot is a strong marketing/sales CRM; SNR-PMO keeps the CRM basics and adds projects, HR & payroll, real double-entry accounting, approve-first AI agents and white-label resale. Honest, side-by-side comparison.`,
    verdict: `HubSpot is excellent at what it's built for — inbound marketing, sales CRM and customer engagement, with a polished ecosystem. But it's front-office by design: Commerce Hub handles invoices and payments, not double-entry accounting; there's no PMO, HR or payroll; and there's no white-label rebill. SNR-PMO covers the CRM basics most operators need, then adds projects, people and real books in one workspace — plus approve-first AI agents and white-label resale. Pick HubSpot for serious marketing and sales depth; pick SNR-PMO to run operations and finances, not just the pipeline.`,
    theyWin: [
      `Deep inbound marketing, content, email and sales automation — the most mature in this comparison.`,
      `A vast app marketplace, integrations and reporting.`,
      `Sophisticated lead scoring, sequences and sales analytics.`,
    ],
    weWin: [
      `Projects & PMO, HR & payroll and real double-entry accounting — none of which HubSpot offers.`,
      `Approve-first AI agents acting on back-office data with audit + rollback (HubSpot's AI targets marketing and sales).`,
      `White-label and resell as your own — HubSpot has no rebill model.`,
      `One product, one bill instead of stacking Hubs and seat tiers as you grow.`,
    ],
    rows: [
      { c: 'Projects & PMO (task to portfolio)', snr: 'y', them: 'n' },
      { c: 'CRM & sales pipeline', snr: 'y', them: 'y' },
      { c: 'Marketing automation depth', snr: 'p', them: 'y', note: `HubSpot's strength; SNR-PMO has campaigns, not full marketing automation` },
      { c: 'HR & payroll', snr: 'y', them: 'n' },
      { c: 'Real double-entry accounting', snr: 'y', them: 'n', note: 'HubSpot Commerce = invoices/payments, not a general ledger' },
      { c: 'Approve-first AI agents (back office)', snr: 'y', them: 'n' },
      { c: 'White-label & resell (multi-tenant)', snr: 'y', them: 'n' },
      { c: 'One product, one bill', snr: 'y', them: 'n' },
    ],
    pricingNote: `HubSpot has free CRM tools, with paid Marketing/Sales/Service Hubs that scale from modest Starter tiers into four- and five-figure monthly Professional and Enterprise plans as contacts and seats grow. Pricing as of June 2026; see hubspot.com.`,
    faqs: [
      { q: 'Is SNR-PMO a HubSpot alternative?', a: `For operators who need more than marketing and sales, yes. SNR-PMO has a real CRM pipeline plus the back office HubSpot lacks — projects, HR & payroll and accounting.` },
      { q: 'Does SNR-PMO replace HubSpot’s marketing?', a: `Not its marketing depth. SNR-PMO has email campaigns with tracking and scheduling, but HubSpot is stronger for inbound marketing. SNR-PMO wins on running the operation behind the marketing.` },
      { q: 'Can I import HubSpot contacts and deals?', a: `Yes — via CSV and the org-scoped REST API.` },
      { q: 'Does SNR-PMO do real accounting?', a: `Yes — double-entry with a general ledger, unlike HubSpot Commerce, which handles invoices and payments only.` },
    ],
  },
];

export function getCompetitor(slug: string): Competitor | undefined {
  return COMPETITORS.find((c) => c.slug === slug);
}


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
  {
    slug: 'monday',
    name: 'Monday.com',
    positioning: 'work management platform (Work OS)',
    keywords: ['Monday.com alternative', 'monday alternative', 'Work OS alternative', 'all-in-one business software', 'monday vs'],
    hero: `Monday.com is a flexible Work OS for running projects and workflows on customizable boards. SNR-PMO covers the same project work, then adds what a Work OS leaves out — a real CRM, HR & payroll, double-entry accounting, approve-first AI agents and white-label resale — in one workspace and one bill.`,
    metaTitle: 'SNR-PMO vs Monday.com — Work OS plus your whole back office (2026)',
    metaDescription: `Monday.com vs SNR-PMO compared. Monday is a flexible Work OS for projects and workflows; SNR-PMO adds a real CRM, HR & payroll, double-entry accounting, approve-first AI agents and white-label resale. Honest, side-by-side comparison.`,
    verdict: `Monday.com is a polished, highly visual Work OS — customizable boards, automations and dashboards that teams genuinely enjoy. But it's a work-management platform, not a business OS: its CRM is a separate paid product, there's no payroll or real double-entry accounting, and there's no white-label resale. SNR-PMO matches the project/work core and folds in a real CRM, HR & payroll, genuine books and approve-first AI agents — one workspace, one bill — and you can white-label and resell it. Choose Monday for best-in-class visual workflow flexibility; choose SNR-PMO to run operations and finances, not just boards.`,
    theyWin: [
      `A polished, highly visual board and automation builder that's fast to adopt.`,
      `A large template and app marketplace, plus mature dashboards and views.`,
      `Flexible workflow automation across many non-PMO use cases.`,
    ],
    weWin: [
      `A real CRM, HR & payroll and double-entry accounting in the same workspace — Monday charges separately for CRM and has no payroll or ledger.`,
      `Approve-first AI agents that act on back-office data with audit + one-click rollback.`,
      `White-label and resell as your own — Monday has no rebill model.`,
      `One product, one bill instead of stacking a Work OS, a CRM and finance tools.`,
    ],
    rows: [
      { c: 'Projects & PMO (task to portfolio)', snr: 'y', them: 'y' },
      { c: 'Visual board / workflow flexibility', snr: 'p', them: 'y', note: `Monday's strength; SNR-PMO has customizable lists, not a visual board OS` },
      { c: 'CRM & sales pipeline', snr: 'y', them: 'p', note: 'Monday CRM is a separate paid product' },
      { c: 'HR & payroll', snr: 'y', them: 'n' },
      { c: 'Real double-entry accounting', snr: 'y', them: 'n' },
      { c: 'Approve-first AI agents (back office)', snr: 'y', them: 'n' },
      { c: 'White-label & resell (multi-tenant)', snr: 'y', them: 'n' },
      { c: 'One product, one bill', snr: 'y', them: 'n' },
    ],
    pricingNote: `Monday.com has a free plan for up to 2 seats, then roughly $9 (Basic), $12 (Standard) and $19 (Pro) per seat/mo billed annually, with a 3-seat minimum; its CRM and Dev products are priced separately. Pricing as of June 2026; see monday.com.`,
    faqs: [
      { q: 'Is SNR-PMO a Monday.com alternative?', a: `Yes, for teams that want Monday's project and work management plus a real CRM, HR & payroll and accounting in the same place — without buying separate products.` },
      { q: 'Does Monday.com include accounting or payroll?', a: `No. Monday is a Work OS; SNR-PMO adds genuine double-entry books and payroll alongside your projects.` },
      { q: 'Is Monday’s CRM included?', a: `Monday CRM is a separate paid product. In SNR-PMO the CRM pipeline is part of the same workspace and bill.` },
      { q: 'Can I white-label SNR-PMO like an agency?', a: `Yes — your brand, domain and reseller billing for unlimited sub-accounts. Monday has no white-label resale.` },
    ],
  },
  {
    slug: 'asana',
    name: 'Asana',
    positioning: 'project & work management',
    keywords: ['Asana alternative', 'Asana vs', 'work management alternative', 'all-in-one business software'],
    hero: `Asana is a clean, well-loved project and work-management tool. SNR-PMO covers the same task and project work, then adds a real CRM, HR & payroll, double-entry accounting, approve-first AI agents and white-label resale — so your whole operation lives in one workspace.`,
    metaTitle: 'SNR-PMO vs Asana — projects plus the rest of your back office (2026)',
    metaDescription: `Asana vs SNR-PMO compared. Asana is excellent at project and work management; SNR-PMO adds a real CRM, HR & payroll, double-entry accounting, approve-first AI agents and white-label resale in one workspace. Honest, side-by-side comparison.`,
    verdict: `Asana is one of the cleanest, most approachable project- and work-management tools — great for tasks, timelines, goals and cross-team coordination. But it stays in its lane: no CRM, no HR or payroll, no accounting, and no white-label resale. SNR-PMO keeps a strong project core and adds the rest of the back office — CRM, HR & payroll, real books — plus approve-first AI agents, in one workspace you can also resell as your own. Pick Asana for elegant task and goal management; pick SNR-PMO to run the whole operation.`,
    theyWin: [
      `A clean, approachable UX with excellent task, timeline and goal management.`,
      `Strong cross-team coordination, reporting and a mature integrations ecosystem.`,
      `Polished mobile apps and a gentle learning curve.`,
    ],
    weWin: [
      `A real CRM, HR & payroll and double-entry accounting — Asana has none of these.`,
      `Approve-first AI agents acting on back-office data with audit + rollback.`,
      `White-label and resell as your own — Asana has no rebill model.`,
      `One product, one bill for projects, people and finances.`,
    ],
    rows: [
      { c: 'Projects & PMO (task to portfolio)', snr: 'y', them: 'y' },
      { c: 'Task / goal management UX', snr: 'p', them: 'y', note: `Asana's strength` },
      { c: 'CRM & sales pipeline', snr: 'y', them: 'n' },
      { c: 'HR & payroll', snr: 'y', them: 'n' },
      { c: 'Real double-entry accounting', snr: 'y', them: 'n' },
      { c: 'Approve-first AI agents (back office)', snr: 'y', them: 'n' },
      { c: 'White-label & resell (multi-tenant)', snr: 'y', them: 'n' },
      { c: 'One product, one bill', snr: 'y', them: 'n' },
    ],
    pricingNote: `Asana has a free Personal tier, then roughly $10.99 (Starter) and $24.99 (Advanced) per user/mo billed annually, with Enterprise on request. Pricing as of June 2026; see asana.com.`,
    faqs: [
      { q: 'Is SNR-PMO an Asana alternative?', a: `Yes, for teams that want Asana-style project management plus a CRM, HR & payroll and accounting in one place.` },
      { q: 'Can I import my Asana projects and tasks?', a: `Yes — via CSV and the org-scoped REST API.` },
      { q: 'Does Asana do CRM or accounting?', a: `No. SNR-PMO adds a real CRM pipeline and double-entry books alongside projects.` },
      { q: 'Why switch from Asana to SNR-PMO?', a: `To consolidate projects, people and finances into one workspace and one bill — and to gain approve-first AI agents and white-label resale.` },
    ],
  },
  {
    slug: 'jira',
    name: 'Jira',
    positioning: 'software & agile project tracking',
    keywords: ['Jira alternative', 'Jira vs', 'agile project management alternative', 'all-in-one business software'],
    hero: `Jira is the standard for software teams — issues, sprints and agile boards. SNR-PMO is built for running the business around delivery: projects and portfolios plus a real CRM, HR & payroll, double-entry accounting and approve-first AI agents, white-labeled and resold as your own.`,
    metaTitle: 'SNR-PMO vs Jira — run the business, not just the backlog (2026)',
    metaDescription: `Jira vs SNR-PMO compared. Jira is the standard for agile software tracking; SNR-PMO runs the whole back office — projects, CRM, HR & payroll, real accounting — with approve-first AI agents and white-label resale. Honest, side-by-side comparison.`,
    verdict: `Jira is the de facto standard for software development — issue tracking, sprints, agile boards and a deep developer ecosystem. If your core need is engineering delivery, Jira is hard to displace. But it's purpose-built for dev work: no CRM, no HR or payroll, no accounting, and no white-label resale, so the rest of the business runs elsewhere. SNR-PMO is the operations-and-finance counterpart — projects and portfolios plus CRM, HR & payroll and real books, with approve-first AI agents — in one resellable workspace. Many teams keep Jira for engineering and run everything else on SNR-PMO.`,
    theyWin: [
      `The deepest agile and dev toolset — sprints, backlogs, workflows and developer integrations (Git, CI/CD).`,
      `A vast Atlassian Marketplace and tight Confluence/Bitbucket integration.`,
      `Highly configurable issue workflows for engineering teams.`,
    ],
    weWin: [
      `Business operations Jira doesn't touch — CRM, HR & payroll and double-entry accounting.`,
      `Approve-first AI agents on back-office work with audit + rollback.`,
      `White-label and resell as your own.`,
      `One product, one bill across projects, people and finances.`,
    ],
    rows: [
      { c: 'Projects & PMO (task to portfolio)', snr: 'y', them: 'y', note: 'Jira excels at software/agile delivery specifically' },
      { c: 'Agile / developer tooling (sprints, issues)', snr: 'p', them: 'y', note: `Jira's strength` },
      { c: 'CRM & sales pipeline', snr: 'y', them: 'n' },
      { c: 'HR & payroll', snr: 'y', them: 'n' },
      { c: 'Real double-entry accounting', snr: 'y', them: 'n' },
      { c: 'Approve-first AI agents (back office)', snr: 'y', them: 'n' },
      { c: 'White-label & resell (multi-tenant)', snr: 'y', them: 'n' },
      { c: 'One product, one bill', snr: 'y', them: 'n' },
    ],
    pricingNote: `Jira has a free tier (up to 10 users), then roughly $7.91 (Standard) and $14.54 (Premium) per user/mo billed annually, with Enterprise on request. Pricing as of June 2026; see atlassian.com.`,
    faqs: [
      { q: 'Is SNR-PMO a Jira alternative?', a: `For general project/portfolio management and the surrounding business, yes. For deep software/agile delivery, Jira remains strong — many teams run Jira for engineering and SNR-PMO for everything else.` },
      { q: 'Does Jira have CRM, HR or accounting?', a: `No. Jira is dev-focused; SNR-PMO adds CRM, HR & payroll and real double-entry books.` },
      { q: 'Can I import from Jira?', a: `Yes — projects and tasks via CSV and the REST API.` },
      { q: 'Does SNR-PMO do sprints like Jira?', a: `SNR-PMO supports projects, tasks and portfolio planning; Jira's agile/dev tooling (sprints, dev integrations) is deeper. SNR-PMO's edge is running the whole business in one place.` },
    ],
  },
  {
    slug: 'quickbooks',
    name: 'QuickBooks',
    positioning: 'small-business accounting',
    keywords: ['QuickBooks alternative', 'QuickBooks Online alternative', 'QuickBooks vs', 'all-in-one software with accounting'],
    hero: `QuickBooks is the small-business accounting standard. SNR-PMO has genuine double-entry accounting too — and wraps it together with projects, CRM, HR & payroll and approve-first AI agents in one workspace, so your books aren't a separate silo from the work that drives them.`,
    metaTitle: 'SNR-PMO vs QuickBooks — accounting inside your whole operation (2026)',
    metaDescription: `QuickBooks vs SNR-PMO compared. QuickBooks is dedicated small-business accounting; SNR-PMO has real double-entry books too, unified with projects, CRM, HR & payroll and approve-first AI agents. Honest, side-by-side comparison.`,
    verdict: `QuickBooks is the incumbent for small-business bookkeeping — mature accounting, a huge accountant network and deep tax and integration coverage. If standalone books are all you need, it's the safe default. But QuickBooks is accounting-first: it isn't a PMO, its CRM is minimal, payroll is a paid add-on, and there's no white-label resale. SNR-PMO has a genuine general ledger too, but unified with projects, CRM, HR & payroll and approve-first AI agents — so a closed deal, a payroll run and logged time all flow into the same books. Choose QuickBooks for deep standalone accounting with your accountant; choose SNR-PMO to run operations and finances together.`,
    theyWin: [
      `Mature, dedicated accounting with deep tax, reporting and bank-feed coverage.`,
      `A vast ecosystem of accountants, bookkeepers and app integrations.`,
      `Long track record and broad third-party support for compliance and filing.`,
    ],
    weWin: [
      `Accounting is unified with projects, CRM, HR & payroll — not a separate silo. Deals, payroll and time post to the same ledger.`,
      `Approve-first AI agents (including draft journal entries) with audit + one-click rollback.`,
      `White-label and resell the whole operation as your own.`,
      `One product, one bill instead of QuickBooks plus a PM tool, a CRM and payroll.`,
    ],
    rows: [
      { c: 'Real double-entry accounting', snr: 'y', them: 'y', note: 'both have a genuine general ledger' },
      { c: 'Accounting/tax depth & accountant ecosystem', snr: 'p', them: 'y', note: `QuickBooks' strength` },
      { c: 'Projects & PMO (task to portfolio)', snr: 'y', them: 'n', note: 'QuickBooks has light project profitability, not PMO' },
      { c: 'CRM & sales pipeline', snr: 'y', them: 'n' },
      { c: 'HR & payroll', snr: 'y', them: 'p', note: 'QuickBooks Payroll is a separate paid add-on' },
      { c: 'Approve-first AI agents (back office)', snr: 'y', them: 'n' },
      { c: 'White-label & resell (multi-tenant)', snr: 'y', them: 'n' },
      { c: 'One product, one bill', snr: 'y', them: 'n' },
    ],
    pricingNote: `QuickBooks Online runs about $38/mo (Simple Start), $75/mo (Essentials) and $115/mo (Plus), with Advanced higher; Payroll is a separate add-on. Pricing as of June 2026; see quickbooks.intuit.com.`,
    faqs: [
      { q: 'Is SNR-PMO a QuickBooks alternative?', a: `For businesses that want their books inside the same system as projects, CRM and payroll, yes. SNR-PMO has real double-entry accounting; QuickBooks is deeper as standalone accounting with an accountant network.` },
      { q: 'Does SNR-PMO have real double-entry accounting?', a: `Yes — a general ledger, chart of accounts, trial balance and P&L, with payroll and invoices posting real journal entries.` },
      { q: 'Can my accountant work in SNR-PMO?', a: `SNR-PMO exports and has a REST API; QuickBooks has the larger accountant ecosystem today, which is the main reason some teams keep it.` },
      { q: 'What does SNR-PMO add over QuickBooks?', a: `Projects and PMO, a real CRM, HR — and approve-first AI agents — plus white-label resale, all sharing the same books.` },
    ],
  },
  {
    slug: 'wrike',
    name: 'Wrike',
    positioning: 'project & work management',
    keywords: ['Wrike alternative', 'Wrike vs', 'project management software', 'work management alternative', 'all-in-one business software'],
    hero: `Wrike is a capable project- and work-management platform with strong reporting and resource planning. SNR-PMO covers the same project work, then adds what Wrike leaves out — a real CRM, HR & payroll, double-entry accounting, approve-first AI agents and white-label resale — so your whole back office lives in one workspace.`,
    metaTitle: 'SNR-PMO vs Wrike — projects plus the rest of your back office (2026)',
    metaDescription: `Wrike vs SNR-PMO compared. Wrike is strong at project and work management; SNR-PMO adds a real CRM, HR & payroll, double-entry accounting, approve-first AI agents and white-label resale in one workspace. Honest, side-by-side comparison.`,
    verdict: `Wrike is a mature project- and work-management platform — Gantt views, resource and capacity planning, proofing and solid cross-team reporting, especially for marketing and professional-services teams. But it stays in the work-management lane: no real CRM, no HR or payroll, no double-entry accounting, and no white-label resale, so the rest of your operation runs elsewhere. SNR-PMO matches the project core and adds the back office Wrike doesn't — CRM, HR & payroll and real books — with approve-first AI agents, in one workspace you can also resell as your own. Choose Wrike for deep work-management and resourcing with an established tool; choose SNR-PMO to run the whole operation in one place.`,
    theyWin: [
      `Mature resource and capacity planning, workload views and proofing/approval tooling for creative and services teams.`,
      `Deep custom dashboards, cross-project reporting and a long-established enterprise feature set.`,
      `A broad integrations catalogue plus add-ons like Wrike Integrate and Datahub.`,
    ],
    weWin: [
      `A real CRM pipeline, HR & payroll and double-entry accounting — none of which Wrike does natively.`,
      `Approve-first AI agents that act on back-office data with an audit trail and one-click rollback (Wrike's AI is assistive).`,
      `White-label and multi-tenant resale as your own — Wrike offers branded workspaces, not reselling.`,
      `One product, one bill for projects, people and finances together.`,
    ],
    rows: [
      { c: 'Projects & PMO (task to portfolio)', snr: 'y', them: 'y' },
      { c: 'Resource & capacity planning', snr: 'p', them: 'y', note: `Wrike's strength; SNR-PMO has workload views, not full capacity planning` },
      { c: 'CRM & sales pipeline', snr: 'y', them: 'n' },
      { c: 'HR & payroll', snr: 'y', them: 'n' },
      { c: 'Real double-entry accounting', snr: 'y', them: 'n' },
      { c: 'Approve-first AI agents (back office)', snr: 'y', them: 'n' },
      { c: 'White-label & resell (multi-tenant)', snr: 'y', them: 'p', note: 'Wrike: branded workspaces, not multi-tenant resale' },
      { c: 'One product, one bill', snr: 'y', them: 'n' },
    ],
    pricingNote: `Wrike has a free tier, then Team (~$10/user/mo) and Business (~$24–25/user/mo), with higher Pinnacle and Apex tiers quoted by sales. Pricing as of June 2026; see wrike.com.`,
    faqs: [
      { q: 'Is SNR-PMO a Wrike alternative?', a: `Yes, for teams that want Wrike-style project and work management plus a real CRM, HR & payroll and accounting in one place — without bolting on separate tools.` },
      { q: 'Does Wrike include CRM, HR or accounting?', a: `No. Wrike is a work-management platform; SNR-PMO adds a real CRM pipeline, HR & payroll and double-entry books alongside your projects.` },
      { q: 'Can I import my Wrike projects and tasks?', a: `Yes — projects, tasks and contacts via CSV, and the org-scoped REST API for larger migrations.` },
      { q: 'How is SNR-PMO’s AI different from Wrike’s?', a: `Wrike's AI is assistive (content and work suggestions). SNR-PMO's agents act on back-office data — drafting tasks, journal entries, onboarding and follow-ups — and every action is approve-first, audited and reversible.` },
    ],
  },

  {
    slug: 'smartsheet',
    name: 'Smartsheet',
    positioning: 'spreadsheet-based work management',
    keywords: ['Smartsheet alternative', 'Smartsheet vs', 'work management alternative', 'project management software', 'all-in-one business software'],
    hero: `Smartsheet runs projects and workflows in a familiar spreadsheet-style grid, with strong automation and reporting. SNR-PMO covers the same project work, then adds a real CRM, HR & payroll, double-entry accounting, approve-first AI agents and white-label resale — so your whole back office lives in one workspace, not a stack of sheets.`,
    metaTitle: 'SNR-PMO vs Smartsheet — projects plus the rest of your back office (2026)',
    metaDescription: `Smartsheet vs SNR-PMO compared. Smartsheet is strong at spreadsheet-based work management; SNR-PMO adds a real CRM, HR & payroll, double-entry accounting, approve-first AI agents and white-label resale in one workspace. Honest, side-by-side comparison.`,
    verdict: `Smartsheet is a powerful, spreadsheet-native work platform — grids, automations, dashboards and large-scale rollups that enterprise teams use to run programs and portfolios. If a familiar sheet metaphor is what your team wants, it's excellent. But it's work-management at heart: no real CRM, no HR or payroll, no double-entry accounting, and no white-label resale. SNR-PMO keeps a strong project core and folds in the rest of the back office — CRM, HR & payroll and genuine books — with approve-first AI agents, in one resellable workspace. Pick Smartsheet for spreadsheet-style work and reporting at scale; pick SNR-PMO to run operations and finances together.`,
    theyWin: [
      `A familiar spreadsheet/grid interface with powerful formulas, automations and large-scale rollups.`,
      `Mature dashboards, reporting and enterprise governance for program and portfolio management.`,
      `A broad connector and add-on ecosystem (Salesforce, Jira, ServiceNow and more).`,
    ],
    weWin: [
      `A real CRM, HR & payroll and double-entry accounting in the same workspace — Smartsheet has none of these.`,
      `Approve-first AI agents acting on back-office data with audit + one-click rollback.`,
      `White-label and resell as your own — Smartsheet has no rebill model.`,
      `One product, one bill instead of stitching sheets to separate CRM, payroll and accounting tools.`,
    ],
    rows: [
      { c: 'Projects & PMO (task to portfolio)', snr: 'y', them: 'y' },
      { c: 'Spreadsheet-style grids & automation', snr: 'p', them: 'y', note: `Smartsheet's strength; SNR-PMO uses customizable lists, not a sheet grid` },
      { c: 'CRM & sales pipeline', snr: 'y', them: 'n', note: 'Smartsheet = build-it-yourself in sheets, not a dedicated CRM' },
      { c: 'HR & payroll', snr: 'y', them: 'n' },
      { c: 'Real double-entry accounting', snr: 'y', them: 'n' },
      { c: 'Approve-first AI agents (back office)', snr: 'y', them: 'n' },
      { c: 'White-label & resell (multi-tenant)', snr: 'y', them: 'n' },
      { c: 'One product, one bill', snr: 'y', them: 'n' },
    ],
    pricingNote: `Smartsheet has a free plan, then Pro (~$9/user/mo) and Business (~$32/user/mo) billed annually, with Enterprise quoted by sales. Pricing as of June 2026; see smartsheet.com.`,
    faqs: [
      { q: 'Is SNR-PMO a Smartsheet alternative?', a: `Yes, for teams that want Smartsheet-style project and work management plus a real CRM, HR & payroll and accounting in one place.` },
      { q: 'Does Smartsheet do CRM, payroll or accounting?', a: `No. Smartsheet is a spreadsheet-based work platform; SNR-PMO adds a real CRM pipeline, HR & payroll and double-entry books alongside projects.` },
      { q: 'Can I import my Smartsheet data?', a: `Yes — sheets, tasks and contacts via CSV, and the org-scoped REST API for larger migrations.` },
      { q: 'Why switch from Smartsheet to SNR-PMO?', a: `To consolidate projects, people and finances into one workspace and one bill — and to gain approve-first AI agents and white-label resale.` },
    ],
  },

  {
    slug: 'zoho',
    name: 'Zoho',
    positioning: 'all-in-one business suite (Zoho One)',
    keywords: ['Zoho alternative', 'Zoho One alternative', 'Zoho vs', 'all-in-one business software', 'Zoho CRM alternative'],
    hero: `Zoho One bundles 45+ apps — CRM, Projects, Books, People and more — for a low per-user price. SNR-PMO covers the same back-office ground in one unified product instead of dozens of separate apps, and adds approve-first AI agents plus turnkey white-label resale built for agencies and operators.`,
    metaTitle: 'SNR-PMO vs Zoho — unified back office vs a 45-app suite (2026)',
    metaDescription: `Zoho (Zoho One) vs SNR-PMO compared. Zoho One bundles 45+ separate apps; SNR-PMO delivers projects, CRM, HR & payroll and real accounting as one unified product, with approve-first AI agents and turnkey white-label resale. Honest, side-by-side comparison.`,
    verdict: `Zoho is one of the most complete competitors here: Zoho One genuinely bundles CRM, Projects, Books (real double-entry accounting), People (HR) and dozens more apps at a famously low per-user price. The trade-off is that it's a suite of 45+ separate applications you stitch together, each with its own UI and learning curve; payroll is region-limited; the AI (Zia) is assistive; and white-labeling is a partner-reselling arrangement rather than turnkey. SNR-PMO delivers the same back-office essentials as one unified product — shared data, one UI — with approve-first AI agents and a turnkey reseller console you brand and bill as your own. Choose Zoho for maximum app breadth at the lowest seat price; choose SNR-PMO for a single unified product, agentic automation and white-label resale.`,
    theyWin: [
      `Unmatched app breadth at a low per-user price — 45+ apps spanning CRM, finance, HR, marketing and support.`,
      `A mature CRM and a genuine accounting app (Zoho Books) with broad localization and tax coverage.`,
      `A huge global install base, partner network and deep per-app configurability.`,
    ],
    weWin: [
      `One unified product with shared data and a single UI — not 45 separate apps to integrate and learn.`,
      `Approve-first AI agents that act on back-office data with audit + one-click rollback (Zoho's Zia is assistive).`,
      `Turnkey white-label resale — your brand, domain and per-client billing from a reseller console, not a partner-rebrand program.`,
      `Projects, CRM, HR & payroll and accounting designed to work as one system from day one.`,
    ],
    rows: [
      { c: 'Projects & PMO (task to portfolio)', snr: 'y', them: 'y' },
      { c: 'CRM & sales pipeline', snr: 'y', them: 'y', note: 'Zoho CRM is a strong, mature product' },
      { c: 'HR & payroll', snr: 'y', them: 'p', note: 'Zoho People is full HR; Zoho Payroll is region-limited (e.g. US / India / UAE / KSA)' },
      { c: 'Real double-entry accounting', snr: 'y', them: 'y', note: 'Zoho Books is a genuine general ledger' },
      { c: 'App breadth (45+ apps)', snr: 'p', them: 'y', note: `Zoho's strength; SNR-PMO is a focused back-office suite, not 45 apps` },
      { c: 'Unified single product (shared data, one UI)', snr: 'y', them: 'p', note: 'Zoho One is many separate apps stitched together' },
      { c: 'Approve-first AI agents (back office)', snr: 'y', them: 'n', note: 'Zoho Zia is assistive, not approve-first agents' },
      { c: 'Turnkey white-label & resell (multi-tenant)', snr: 'y', them: 'p', note: 'Zoho = partner rebranding/reselling, not turnkey resale' },
      { c: 'One product, one bill', snr: 'y', them: 'p', note: 'Zoho One is one bill across many separate apps' },
    ],
    pricingNote: `Zoho One bundles 45+ apps for roughly $37/user/mo on the all-employee annual plan (you must license every employee) or about $90/user/mo for flexible per-user licensing; individual Zoho apps are also sold separately. Pricing as of June 2026; see zoho.com/one.`,
    faqs: [
      { q: 'Is SNR-PMO a Zoho alternative?', a: `Yes. Zoho One is a broad bundle of 45+ separate apps; SNR-PMO delivers the back-office essentials — projects, CRM, HR & payroll and real accounting — as one unified product, with approve-first AI agents and turnkey white-label resale.` },
      { q: 'Does SNR-PMO have real accounting like Zoho Books?', a: `Yes — a genuine general ledger with a chart of accounts, trial balance and P&L, where payroll runs and invoices post real journal entries.` },
      { q: 'Zoho One is cheap per user — why choose SNR-PMO?', a: `Zoho wins on raw app breadth and seat price. SNR-PMO trades breadth for a single unified product (shared data, one UI), approve-first AI agents, and turnkey white-label resale you can brand and bill as your own.` },
      { q: 'Can I white-label SNR-PMO like a Zoho partner?', a: `Yes, but turnkey: your brand, domain and reseller billing for unlimited sub-accounts from one console — not a partner program reselling Zoho-branded apps.` },
    ],
  },

  {
    slug: 'salesforce',
    name: 'Salesforce',
    positioning: 'enterprise sales & CRM cloud',
    keywords: ['Salesforce alternative', 'Salesforce vs', 'CRM alternative', 'Sales Cloud alternative', 'all-in-one business software'],
    hero: `Salesforce is the enterprise CRM standard — deep sales, service and a vast AppExchange. SNR-PMO keeps a real CRM pipeline, then adds the operational back office Salesforce leaves to add-ons and partners — projects, HR & payroll, real double-entry accounting and approve-first AI agents — white-labeled and resold as your own, at a fraction of the cost.`,
    metaTitle: 'SNR-PMO vs Salesforce — CRM plus the whole back office (2026)',
    metaDescription: `Salesforce vs SNR-PMO compared. Salesforce is the enterprise CRM leader; SNR-PMO keeps a real CRM and adds projects, HR & payroll, double-entry accounting, approve-first AI agents and white-label resale in one workspace — without the enterprise price tag. Honest, side-by-side comparison.`,
    verdict: `Salesforce is the enterprise CRM leader — unmatched depth in sales and service, a massive AppExchange and near-infinite customization. For large sales organizations that can invest in admins and integration, it's formidable. But it's CRM-and-platform by design: projects, HR, payroll and double-entry accounting come from add-ons, AppExchange apps or partners; there's no turnkey white-label resale; and total cost climbs quickly with seats, clouds and implementation. SNR-PMO covers the CRM basics most operators need, then adds projects, people and real books in one workspace — with approve-first AI agents and white-label resale — at SMB pricing. Pick Salesforce for enterprise sales depth and ecosystem; pick SNR-PMO to run the whole operation affordably in one place.`,
    theyWin: [
      `The deepest enterprise sales and service CRM, with sophisticated automation, forecasting and analytics.`,
      `A vast AppExchange ecosystem and near-unlimited customization for complex orgs.`,
      `Front-office AI (Agentforce) and an enormous partner and admin talent pool.`,
    ],
    weWin: [
      `Projects & PMO, HR & payroll and real double-entry accounting — Salesforce relies on add-ons, AppExchange apps or partners for these.`,
      `Approve-first AI agents acting on back-office data (tasks, journal entries, onboarding) with audit + rollback — Agentforce targets sales and service.`,
      `Turnkey white-label and resale as your own — Salesforce has no SMB rebill model.`,
      `One product, one bill at SMB pricing instead of stacking clouds, add-ons and implementation.`,
    ],
    rows: [
      { c: 'CRM & sales pipeline', snr: 'y', them: 'y', note: 'Salesforce is deeper for enterprise sales' },
      { c: 'Enterprise sales depth & ecosystem', snr: 'p', them: 'y', note: `Salesforce's strength (AppExchange, customization)` },
      { c: 'Projects & PMO (task to portfolio)', snr: 'y', them: 'n', note: 'Salesforce needs PSA / AppExchange apps for project delivery' },
      { c: 'HR & payroll', snr: 'y', them: 'n' },
      { c: 'Real double-entry accounting', snr: 'y', them: 'n', note: 'Salesforce has no native general ledger' },
      { c: 'Approve-first AI agents (back office)', snr: 'y', them: 'n', note: 'Agentforce is front-office (sales / service)' },
      { c: 'White-label & resell (multi-tenant)', snr: 'y', them: 'n' },
      { c: 'One product, one bill', snr: 'y', them: 'n', note: 'Salesforce prices per cloud / seat + add-ons' },
    ],
    pricingNote: `Salesforce Sales Cloud spans Starter ($25), Pro ($100), Enterprise ($175), Unlimited ($350) and Agentforce 1 Sales ($550) per user/mo; most growing teams land on Enterprise, and other clouds/add-ons are priced separately. Pricing as of June 2026; see salesforce.com.`,
    faqs: [
      { q: 'Is SNR-PMO a Salesforce alternative?', a: `For operators who need more than a sales CRM, yes. SNR-PMO has a real CRM pipeline plus the back office Salesforce leaves to add-ons — projects, HR & payroll and double-entry accounting — at SMB pricing.` },
      { q: 'Does Salesforce do accounting, HR or payroll?', a: `Not natively — those come from AppExchange apps, add-ons or partners. SNR-PMO includes a real general ledger, HR and payroll in the same workspace.` },
      { q: 'Is SNR-PMO cheaper than Salesforce?', a: `For most small and mid-size teams, yes — one predictable bill versus per-seat, per-cloud pricing plus add-ons and implementation. Compare your own seat count on the pricing page.` },
      { q: 'How is SNR-PMO’s AI different from Salesforce Agentforce?', a: `Agentforce focuses on front-office sales and service. SNR-PMO's agents work the back office — tasks, journal entries, onboarding and follow-ups — and every action is approve-first, audited and reversible.` },
    ],
  },
];

export function getCompetitor(slug: string): Competitor | undefined {
  return COMPETITORS.find((c) => c.slug === slug);
}

/** Canonical 7-capability set + per-competitor marks for the /alternatives master comparison table (order fixed). */
export const CANONICAL_CAPS: string[] = [
  'Projects & PMO',
  'CRM & sales pipeline',
  'HR & payroll',
  'Real double-entry accounting',
  'Approve-first AI agents',
  'White-label & resell',
  'One product, one bill',
];

export const SNR_MATRIX: Mark[] = ['y', 'y', 'y', 'y', 'y', 'y', 'y'];

export const MATRIX: Record<string, Mark[]> = {
  gohighlevel: ['n', 'y', 'n', 'n', 'n', 'y', 'p'],
  clickup: ['y', 'p', 'n', 'n', 'n', 'p', 'n'],
  odoo: ['y', 'y', 'y', 'y', 'n', 'p', 'p'],
  hubspot: ['n', 'y', 'n', 'n', 'n', 'n', 'n'],
  monday: ['y', 'p', 'n', 'n', 'n', 'n', 'n'],
  asana: ['y', 'n', 'n', 'n', 'n', 'n', 'n'],
  jira: ['y', 'n', 'n', 'n', 'n', 'n', 'n'],
  quickbooks: ['n', 'n', 'p', 'y', 'n', 'n', 'n'],
  wrike: ['y', 'n', 'n', 'n', 'n', 'p', 'n'],
  smartsheet: ['y', 'n', 'n', 'n', 'n', 'n', 'n'],
  zoho: ['y', 'y', 'p', 'y', 'n', 'p', 'p'],
  salesforce: ['n', 'y', 'n', 'n', 'n', 'n', 'n'],
};

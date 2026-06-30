import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPageHidden, UNHIDEABLE, navHrefForRoute, MODULE_GROUPS, TENANT_ITEMS, featureForRoute, ROUTE_LABELS, SECTIONS, RESELLER_SECTION, PLATFORM_SECTION, ADMIN_SECTION } from '@/lib/nav';

test('isPageHidden: not hidden by default', () => {
  assert.equal(isPageHidden([], '/tasks'), false);
  assert.equal(isPageHidden(undefined, '/tasks'), false);
});
test('isPageHidden: hidden when listed', () => { assert.equal(isPageHidden(['/tasks'], '/tasks'), true); });
test('dashboard/settings can never be hidden (UNHIDEABLE)', () => {
  assert.equal(isPageHidden(['/dashboard'], '/dashboard'), false);
  assert.equal(isPageHidden(['/settings'], '/settings'), false);
  assert.equal(UNHIDEABLE.has('/dashboard'), true);
  assert.equal(UNHIDEABLE.has('/settings'), true);
});
test('navHrefForRoute maps exact + sub-routes (longest prefix)', () => {
  assert.equal(navHrefForRoute('/tasks'), '/tasks');
  assert.equal(navHrefForRoute('/projects/123'), '/projects');
  assert.equal(navHrefForRoute('/crm/deal/9'), '/crm');
});
test('navHrefForRoute undefined for platform/unknown routes', () => {
  assert.equal(navHrefForRoute('/platform'), undefined);
  assert.equal(navHrefForRoute('/zzz-nope'), undefined);
});
test('MODULE_GROUPS excludes unhideable + platform, includes real pages', () => {
  const hrefs = MODULE_GROUPS.flatMap((g) => g.items.map((i) => i.href));
  assert.equal(hrefs.includes('/dashboard'), false);
  assert.equal(hrefs.includes('/settings'), false);
  assert.equal(hrefs.includes('/platform'), false);
  assert.equal(hrefs.includes('/tenants'), false);
  assert.equal(hrefs.includes('/tasks'), true);
  assert.ok(MODULE_GROUPS.length > 3);
});
test('every TENANT_ITEM has href + label', () => {
  for (const i of TENANT_ITEMS) { assert.ok(i.href); assert.ok(i.label); }
});
test('featureForRoute maps route to gating feature', () => {
  assert.equal(featureForRoute('/crm'), 'crm');
  assert.equal(featureForRoute('/projects/123'), 'projects');
  assert.equal(featureForRoute('/dashboard'), undefined);
});

test('Phase1 IA: Marketing + Inbox menus exist with expected pages', () => {
  const byKey = Object.fromEntries(SECTIONS.filter((s) => s.kind === 'menu').map((s: any) => [s.key, s]));
  assert.ok(byKey.marketing, 'marketing menu missing');
  assert.ok(byKey.inbox, 'inbox menu missing');
  const mk = byKey.marketing.items.map((i: any) => i.href);
  assert.deepEqual(mk, ['/social', '/forms', '/sequences']);
  const ix = byKey.inbox.items.map((i: any) => i.href);
  assert.deepEqual(ix, ['/chat', '/messaging', '/inbox']);
});
test('Phase1 IA: Finance menu renamed; CRM/Work no longer hold moved pages', () => {
  const menus = SECTIONS.filter((s) => s.kind === 'menu') as any[];
  const finance = menus.find((s) => s.key === 'tracking');
  assert.equal(finance.label, 'Finance');
  const crm = menus.find((s) => s.key === 'crm').items.map((i: any) => i.href);
  assert.equal(crm.includes('/forms'), false);
  assert.equal(crm.includes('/sequences'), false);
  const work = menus.find((s) => s.key === 'work').items.map((i: any) => i.href);
  assert.equal(work.includes('/chat'), false);
});
test('Phase1 IA: Work▸Roadmap relabelled Timeline (route unchanged)', () => {
  assert.equal(ROUTE_LABELS['/roadmap'], 'Timeline');
  assert.equal(featureForRoute('/roadmap'), 'projects');
});
test('Phase1 IA: sub-group headers present on Finance/HR/CRM/Admin', () => {
  const menus = SECTIONS.filter((s) => s.kind === 'menu') as any[];
  for (const k of ['tracking', 'hr', 'crm']) {
    const m = menus.find((s) => s.key === k);
    assert.ok(m.items.every((i: any) => i.group), `${k} items missing group`);
  }
  // MODULE_GROUPS still builds the new menus as grantable permission groups
  const gkeys = MODULE_GROUPS.map((g) => g.key);
  assert.ok(gkeys.includes('marketing'));
  assert.ok(gkeys.includes('inbox'));
});

test('Phase2A: Reseller console sections surfaced as grouped routes', () => {
  assert.equal(RESELLER_SECTION.kind, 'menu');
  const items = RESELLER_SECTION.kind === 'menu' ? RESELLER_SECTION.items : [];
  const hrefs = items.map((i) => i.href);
  for (const h of ['/reseller', '/reseller/payments', '/reseller/clients', '/reseller/co-owners', '/reseller/snapshots']) {
    assert.ok(hrefs.includes(h), `reseller nav missing ${h}`);
  }
  const landing = items.find((i) => i.href === '/reseller');
  assert.equal(landing?.exact, true);
  assert.ok(items.every((i) => i.group), 'reseller items must be grouped like Administration');
});

test('Phase2B: Platform console grouped routes; landing exact; no /platform/plans 404', () => {
  assert.equal(PLATFORM_SECTION.kind, 'menu');
  const items = PLATFORM_SECTION.kind === 'menu' ? PLATFORM_SECTION.items : [];
  const hrefs = items.map((i) => i.href);
  for (const h of ['/platform', '/platform/billing', '/platform/rollout', '/platform/campaigns', '/platform/errors']) {
    assert.ok(hrefs.includes(h), `platform nav missing ${h}`);
  }
  // 404 fix: nav must NOT point at /platform/plans as a primary item (plans = /platform landing)
  const landing = items.find((i) => i.href === '/platform');
  assert.equal(landing?.exact, true);
  assert.equal(landing?.label, 'Plans & Features');
  assert.ok(items.every((i) => i.group), 'platform items must be grouped');
  assert.equal(featureForRoute('/platform/billing'), undefined);
});

test('IA moves: Roadmap + Feedback under Platform; Feedback out of Administration; Reseller has Insights', () => {
  const pItems = PLATFORM_SECTION.kind === 'menu' ? PLATFORM_SECTION.items.map((i) => i.href) : [];
  assert.ok(pItems.includes('/product-roadmap'), 'Roadmap should be under Platform');
  assert.ok(pItems.includes('/feedback'), 'Feedback should be under Platform');
  const aItems = ADMIN_SECTION.kind === 'menu' ? ADMIN_SECTION.items.map((i) => i.href) : [];
  assert.equal(aItems.includes('/feedback'), false, 'Feedback should no longer be in Administration');
  const rItems = RESELLER_SECTION.kind === 'menu' ? RESELLER_SECTION.items.map((i) => i.href) : [];
  assert.ok(rItems.includes('/reseller/insights'), 'Reseller should have Insights');
  // moved feedback is operator-only → not a tenant module group
  const mg = MODULE_GROUPS.flatMap((g) => g.items.map((i) => i.href));
  assert.equal(mg.includes('/feedback'), false);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPageHidden, UNHIDEABLE, navHrefForRoute, MODULE_GROUPS, TENANT_ITEMS, featureForRoute } from '@/lib/nav';

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

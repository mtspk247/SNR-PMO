import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectivePagePerm, pageReadable, hasFeature, isUpsellLocked, navVisible, roleAllowsFeature } from '@/lib/entitlements';
import type { AppUser, MyOrg } from '@/lib/supabase';

const user = (over: Partial<AppUser> = {}): AppUser =>
  ({ id: 'u1', auth_user_id: 'a1', username: 'u', email: 'e@x.co', full_name: 'F', role: 'member' as any, ...over });
const org = (over: Partial<MyOrg> = {}): MyOrg =>
  ({ id: 'o', slug: 's', name: 'n', branding: {} as any, plan: 'pro', member_role: 'admin' as any, features: [], planFeatures: [], ...over });

test('effectivePagePerm defaults to full access when unset', () => {
  assert.deepEqual(effectivePagePerm(user(), '/tasks'), { c: true, r: true, u: true, d: true });
  assert.equal(pageReadable(user(), '/tasks'), true);
});
test('role-template restriction applies (delete off, read still on)', () => {
  const u = user({ role_template: { page_perms: { '/tasks': { d: false } } } });
  assert.equal(effectivePagePerm(u, '/tasks').d, false);
  assert.equal(effectivePagePerm(u, '/tasks').r, true);
});
test('user override wins over role template', () => {
  const u = user({ role_template: { page_perms: { '/tasks': { r: false } } }, page_perms: { '/tasks': { r: true } } });
  assert.equal(pageReadable(u, '/tasks'), true);
});
test('explicit read=false hides the page', () => {
  assert.equal(pageReadable(user({ page_perms: { '/payroll': { r: false } } }), '/payroll'), false);
});
test('null user is readable (no restriction layer)', () => {
  assert.equal(pageReadable(null, '/tasks'), true);
});
test('hasFeature reflects effective features; no key = core', () => {
  assert.equal(hasFeature(org({ features: ['crm'] }), 'crm' as any), true);
  assert.equal(hasFeature(org({ features: [] }), 'crm' as any), false);
  assert.equal(hasFeature(org(), undefined), true);
});
test('isUpsellLocked only when plan lacks the feature', () => {
  assert.equal(isUpsellLocked(org({ features: [], planFeatures: [] }), 'crm' as any), true);
  assert.equal(isUpsellLocked(org({ features: [], planFeatures: ['crm'] }), 'crm' as any), false);
});
test('navVisible: on or upsell-locked shown; operator-disabled hidden', () => {
  assert.equal(navVisible(org({ features: ['crm'], planFeatures: ['crm'] }), 'crm' as any), true);
  assert.equal(navVisible(org({ features: [], planFeatures: [] }), 'crm' as any), true);
  assert.equal(navVisible(org({ features: [], planFeatures: ['crm'] }), 'crm' as any), false);
});
test('roleAllowsFeature: empty list = all; else whitelist', () => {
  assert.equal(roleAllowsFeature(user({ feature_access: [] }), 'crm' as any), true);
  assert.equal(roleAllowsFeature(user({ feature_access: ['hr'] }), 'crm' as any), false);
  assert.equal(roleAllowsFeature(user({ feature_access: ['crm'] }), 'crm' as any), true);
});

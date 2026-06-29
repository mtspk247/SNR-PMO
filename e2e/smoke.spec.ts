import { test, expect } from '@playwright/test';

// Resilient smoke: assert HTTP health + guaranteed SSR markers, not brittle copy.

test('landing renders with a title', async ({ page }) => {
  const res = await page.goto('/');
  expect(res, 'no response for /').toBeTruthy();
  expect(res!.status()).toBeLessThan(400);
  await expect(page).toHaveTitle(/.+/);
});

test('login page is reachable', async ({ page }) => {
  const res = await page.goto('/login');
  expect(res, 'no response for /login').toBeTruthy();
  expect(res!.status()).toBeLessThan(400);
});

test('vs/gohighlevel renders competitor content server-side', async ({ page }) => {
  await page.goto('/vs/gohighlevel');
  await expect(page.locator('body')).toContainText('GoHighLevel');
});

test('alternatives pillar is reachable', async ({ page }) => {
  const res = await page.goto('/alternatives');
  expect(res, 'no response for /alternatives').toBeTruthy();
  expect(res!.status()).toBeLessThan(400);
});

test('sitemap.xml serves a urlset', async ({ request }) => {
  const r = await request.get('/sitemap.xml');
  expect(r.status()).toBeLessThan(400);
  expect(await r.text()).toContain('<urlset');
});

test('robots.txt references the sitemap', async ({ request }) => {
  const r = await request.get('/robots.txt');
  expect(r.status()).toBeLessThan(400);
  expect((await r.text()).toLowerCase()).toContain('sitemap');
});

test('ai-agents page renders the moat content', async ({ page }) => {
  const res = await page.goto('/ai-agents');
  expect(res, 'no response for /ai-agents').toBeTruthy();
  expect(res!.status()).toBeLessThan(400);
  await expect(page.locator('body')).toContainText('Approve');
});

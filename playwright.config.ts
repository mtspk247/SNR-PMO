import { defineConfig, devices } from '@playwright/test';

// Public-route smoke. Target is set per-run via BASE_URL (PR preview or prod).
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 15_000 },
  retries: 2,
  reporter: [['line']],
  use: {
    baseURL: process.env.BASE_URL || 'https://snr-pmo.vercel.app',
    trace: 'off',
    navigationTimeout: 30_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

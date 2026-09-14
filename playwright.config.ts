import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests', testMatch: '*.spec.ts', workers: 1, timeout: 30000, expect: { timeout: 5000 }, reporter: 'list', use: { screenshot: 'only-on-failure' } });

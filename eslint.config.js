import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/', 'test-results/', 'playwright-report/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['src/**/*.ts'], languageOptions: { globals: { ...globals.browser, chrome: 'readonly' } } },
  // Tests and the screenshot/icon scripts run code inside the browser through page.evaluate.
  { files: ['tests/**/*.ts', 'playwright.config.ts', 'scripts/**/*.mjs'], languageOptions: { globals: { ...globals.node, ...globals.browser, chrome: 'readonly' } } },
  // Tests send deliberately loose commands to exercise sanitising.
  { files: ['tests/**/*.ts'], rules: { '@typescript-eslint/no-explicit-any': 'off' } },
  { files: ['eslint.config.js'], languageOptions: { globals: globals.node } },
);

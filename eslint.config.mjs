// ESLint: finds bugs such as unreachable code, duplicate keys, wrong comparisons and
// variables used before they exist. Run with: npm run lint
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', '.wrangler/', 'private/', 'tests/results/'] },
  // Server (Cloudflare Worker): strict, every variable must be defined
  {
    files: ['src/**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.serviceworker, ...globals.es2024 } },
    rules: { ...js.configs.recommended.rules, 'no-unused-vars': ['error', { args: 'none' }], 'no-empty': ['error', { allowEmptyCatch: true }] },
  },
  // Tests and tools (Node)
  {
    files: ['tests/**/*.mjs', 'tools/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node } },
    rules: { ...js.configs.recommended.rules },
  },
  // Browser pages: classic scripts that share globals across files, so "undefined" and
  // "unused" checks are left to the browser tests; every other recommended rule applies.
  {
    files: ['public/**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'script', globals: { ...globals.browser } },
    rules: { ...js.configs.recommended.rules, 'no-undef': 'off', 'no-unused-vars': 'off', 'no-redeclare': 'off', 'no-empty': ['error', { allowEmptyCatch: true }] },
  },
];

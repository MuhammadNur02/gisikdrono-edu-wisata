import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FlatCompat } from '@eslint/eslintrc';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: projectRoot });

// CLAUDE.md §6.1: the only modules allowed to import the service-role client.
const serviceRoleAllowList = [
  'src/app/api/webhooks/**',
  'src/app/api/jobs/**',
  'src/server/services/{booking,payment,ticket,notification,document,export,staff}-service.ts',
  'scripts/**',
];

const serviceRoleClientBan = {
  group: ['@/lib/supabase/admin', '**/supabase/admin'],
  message:
    'The service-role client is allow-listed (CLAUDE.md §6.1). Use @/lib/supabase/server so RLS applies.',
};

const serverLayerBan = {
  group: ['@/server/*', '@/server/**'],
  message:
    'Components and hooks never import src/server/** (CLAUDE.md §3.2). Pass data in as props.',
};

const browserClientBan = {
  group: ['@/lib/supabase/client', '**/supabase/client'],
  message:
    'Staff pages never read data with the browser client (CLAUDE.md §6.1, docs/Security.md AZ-06).',
};

const createBrowserClientBan = {
  name: '@supabase/ssr',
  importNames: ['createBrowserClient'],
  message: browserClientBan.message,
};

export default defineConfig([
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'src/db/types.ts', 'coverage/**'],
  },
  ...compat.extends('next/core-web-vitals'),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: projectRoot },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    rules: {
      'react/no-danger': 'error',
      'no-console': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='process'][property.name='env']",
          message: 'Read configuration through src/lib/env.ts (CLAUDE.md §7.7).',
        },
      ],
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
          pathGroups: [{ pattern: '@/**', group: 'internal' }],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'no-restricted-imports': ['error', { patterns: [serviceRoleClientBan] }],
    },
  },
  {
    files: ['src/components/**', 'src/hooks/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [serviceRoleClientBan, serverLayerBan] }],
    },
  },
  {
    files: ['src/app/(admin)/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [createBrowserClientBan], patterns: [serviceRoleClientBan, browserClientBan] },
      ],
    },
  },
  {
    files: serviceRoleAllowList,
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['src/lib/logger.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['src/lib/env.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
]);

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FlatCompat } from '@eslint/eslintrc';
import { defineConfig } from 'eslint/config';
import checkFile from 'eslint-plugin-check-file';
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

const namingRules = [
  { selector: 'default', format: ['camelCase'], leadingUnderscore: 'allow' },
  { selector: 'variable', format: ['camelCase', 'UPPER_CASE', 'PascalCase'] },
  { selector: 'function', format: ['camelCase', 'PascalCase'] },
  { selector: 'typeLike', format: ['PascalCase'] },
  { selector: 'enumMember', format: ['PascalCase', 'UPPER_CASE'] },
  { selector: 'import', format: ['camelCase', 'PascalCase'] },
  // Database columns, HTTP headers and provider payloads keep the spelling the other side uses.
  { selector: ['objectLiteralProperty', 'typeProperty', 'objectLiteralMethod'], format: null },
  { selector: ['variable', 'parameter'], modifiers: ['destructured'], format: null },
];

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
      '@typescript-eslint/naming-convention': ['error', ...namingRules],
      '@typescript-eslint/no-magic-numbers': [
        'error',
        {
          ignore: [-1, 0, 1],
          ignoreArrayIndexes: true,
          ignoreDefaultValues: true,
          ignoreEnums: true,
          ignoreNumericLiteralTypes: true,
          ignoreReadonlyClassProperties: true,
          ignoreTypeIndexes: true,
          enforceConst: true,
        },
      ],
    },
  },
  {
    files: ['src/hooks/**/*.ts'],
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        ...namingRules,
        {
          selector: 'function',
          modifiers: ['exported'],
          format: ['camelCase'],
          custom: { regex: '^use[A-Z]', match: true },
        },
      ],
    },
  },
  {
    files: ['src/components/**/*.tsx'],
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        ...namingRules,
        { selector: 'function', modifiers: ['exported'], format: ['PascalCase'] },
      ],
    },
  },
  {
    // Route handlers must export GET, POST and friends in capitals.
    files: ['src/app/**/route.ts'],
    rules: {
      '@typescript-eslint/naming-convention': [
        'error',
        ...namingRules,
        { selector: 'function', modifiers: ['exported'], format: ['UPPER_CASE', 'camelCase'] },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}', 'scripts/**/*.{ts,mjs}', 'tests/**/*.ts'],
    plugins: { 'check-file': checkFile },
    rules: {
      'check-file/filename-naming-convention': [
        'error',
        { '**/*.{ts,tsx,mjs}': 'KEBAB_CASE', 'src/hooks/**/*.ts': 'use-+([a-z0-9-])' },
        { ignoreMiddleExtensions: true },
      ],
    },
  },
  {
    rules: {
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
      complexity: ['error', 10],
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
  {
    // Constants live in src/config and enums in src/db/enums.ts, so numbers are expected there.
    files: ['src/config/**', 'src/db/enums.ts'],
    rules: { '@typescript-eslint/no-magic-numbers': 'off' },
  },
  {
    // A describe block grows with its cases, and test data is full of literal numbers on purpose.
    files: ['**/*.test.ts', 'tests/**'],
    rules: {
      'max-lines-per-function': 'off',
      '@typescript-eslint/no-magic-numbers': 'off',
    },
  },
]);

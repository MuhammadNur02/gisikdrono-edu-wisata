import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FlatCompat } from '@eslint/eslintrc';
import { defineConfig } from 'eslint/config';
import checkFile from 'eslint-plugin-check-file';
import tseslint from 'typescript-eslint';

import { noLoggingWholeRecords } from './scripts/eslint-rules/no-logging-whole-records.mjs';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: projectRoot });

// CLAUDE.md §6.1: the only modules allowed to import the service-role client. upload-service signs and
// finalizes uploads, which no API role may do through Storage (decision of 2026-10-18).
const serviceRoleAllowList = [
  'src/app/api/webhooks/**',
  'src/app/api/jobs/**',
  'src/server/services/{booking,payment,ticket,notification,document,export,staff,upload}-service.ts',
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

const anonClientBan = {
  group: ['@/lib/supabase/anon', '**/supabase/anon'],
  message: 'The session-less anon client serves src/lib/queries only (CLAUDE.md §6.1).',
};

// docs/StyleGuide.md §7.1: LazyMotion runs in strict mode, so components animate with `m` and the full
// `motion` component (the whole bundle) is reserved for src/lib/motion.
const fullMotionBan = {
  name: 'motion/react',
  importNames: ['motion'],
  message: 'Animate with m from motion/react; LazyMotion is strict (docs/StyleGuide.md §7.1).',
};

// docs/StyleGuide.md §7.3: tables, forms, the sidebar and charts never animate (CSS transitions only).
const noMotionMessage =
  'Tables, forms, the sidebar and charts do not animate; use CSS transition-colors (docs/StyleGuide.md §7.3).';
const stillSurfaceFiles = [
  'src/components/admin/data-table/**',
  'src/components/forms/**',
  'src/components/admin/shell/*sidebar*',
  'src/components/admin/charts/**',
];
const stillSurfaceBans = [
  { name: 'motion/react', importNames: ['m', 'motion'], message: noMotionMessage },
  { name: 'motion/react-m', message: noMotionMessage },
];

// The public site reads as a visitor does, through src/lib/queries and the session-less anon client, so a
// signed-in staff member sees exactly the site a visitor sees and every page can be cached for everyone.
const publicSiteReadMessage =
  'Public pages read through @/lib/queries, which uses the session-less anon client (CLAUDE.md §3.2, §6.1).';

const publicPageBans = {
  paths: [
    { name: 'next/headers', importNames: ['cookies'], message: publicSiteReadMessage },
    fullMotionBan,
  ],
  patterns: [
    { group: ['@/lib/supabase/*', '**/supabase/*', '@supabase/*'], message: publicSiteReadMessage },
    { group: ['@/server/*', '@/server/**'], message: publicSiteReadMessage },
  ],
};

const queriesBans = {
  paths: [
    {
      name: 'next/headers',
      message: 'src/lib/queries never reads the request: its reads are cached for everyone.',
    },
    { name: '@supabase/ssr', message: 'src/lib/queries reads through @/lib/supabase/anon only.' },
  ],
  patterns: [
    serviceRoleClientBan,
    {
      group: [
        '@/lib/supabase/server',
        '**/supabase/server',
        '@/lib/supabase/client',
        '**/supabase/client',
      ],
      message:
        'src/lib/queries reads through @/lib/supabase/anon only, never a session or the browser client.',
    },
  ],
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
    plugins: { local: { rules: { 'no-logging-whole-records': noLoggingWholeRecords } } },
    rules: {
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
      complexity: ['error', 10],
      'local/no-logging-whole-records': 'error',
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
      'no-restricted-imports': [
        'error',
        { paths: [fullMotionBan], patterns: [serviceRoleClientBan, anonClientBan] },
      ],
    },
  },
  {
    files: ['src/components/**', 'src/hooks/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [fullMotionBan], patterns: [serviceRoleClientBan, serverLayerBan, anonClientBan] },
      ],
    },
  },
  {
    files: stillSurfaceFiles,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: stillSurfaceBans,
          patterns: [serviceRoleClientBan, serverLayerBan, anonClientBan],
        },
      ],
    },
  },
  {
    files: ['src/lib/motion/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [serviceRoleClientBan, anonClientBan] }],
      // Motion tokens are the one place durations, easings and distances are written as numbers.
      '@typescript-eslint/no-magic-numbers': 'off',
    },
  },
  {
    files: ['src/app/(admin)/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [createBrowserClientBan, fullMotionBan],
          patterns: [serviceRoleClientBan, browserClientBan, anonClientBan],
        },
      ],
    },
  },
  {
    files: ['src/app/(public)/**'],
    rules: { 'no-restricted-imports': ['error', publicPageBans] },
  },
  {
    files: ['src/lib/queries/**'],
    rules: { 'no-restricted-imports': ['error', queriesBans] },
  },
  {
    // The anon client's own test proves it reads as a visitor.
    files: ['src/lib/supabase/anon.test.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: [serviceRoleClientBan] }] },
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
    // next.config.ts runs at build time before src/lib/env.ts can load, and only reads build switches.
    // src/lib/public-literals.ts reads the NEXT_PUBLIC_* values by their literal names so Next.js inlines them
    // for the browser, without the zod validation of public-env.ts (CLAUDE.md §7.7).
    files: ['src/lib/env.ts', 'src/lib/public-env.ts', 'src/lib/public-literals.ts', 'next.config.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    // Constants live in src/config and enums in src/db/enums.ts, so numbers are expected there.
    files: ['src/config/**', 'src/db/enums.ts'],
    rules: { '@typescript-eslint/no-magic-numbers': 'off' },
  },
  {
    // A describe block grows with its cases, and test data is full of literal numbers on purpose.
    files: ['**/*.test.{ts,mjs}', 'tests/**'],
    rules: {
      'max-lines-per-function': 'off',
      '@typescript-eslint/no-magic-numbers': 'off',
    },
  },
]);

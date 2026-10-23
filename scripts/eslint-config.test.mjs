import { fileURLToPath } from 'node:url';

import { ESLint, Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { beforeAll, describe, expect, it } from 'vitest';

// The import rules of eslint.config.mjs, as ESLint computes them for a given path, applied to one import line:
// public pages read like a visitor (CLAUDE.md §3.2, §6.1), so a signed-in staff member sees the same site.
const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const eslint = new ESLint({ cwd: projectRoot });
const linter = new Linter({ configType: 'flat' });

async function isRefused(filePath, importLine) {
  const config = await eslint.calculateConfigForFile(filePath);
  const messages = linter.verify(
    importLine,
    [
      {
        files: ['**/*.{ts,tsx}'],
        languageOptions: { parser: tseslint.parser },
        rules: { 'no-restricted-imports': config.rules['no-restricted-imports'] },
      },
    ],
    filePath,
  );
  return messages.some((message) => message.ruleId === 'no-restricted-imports');
}

const publicPage = 'src/app/(public)/(rows)/paket-wisata/[slug]/page.tsx';
const query = 'src/lib/queries/packages.ts';
const CONFIG_LOAD_TIMEOUT_MS = 60_000;

// The same for no-restricted-syntax, applied to one statement.
async function isSyntaxRefused(filePath, statement) {
  const config = await eslint.calculateConfigForFile(filePath);
  const messages = linter.verify(
    statement,
    [
      {
        files: ['**/*.{ts,tsx}'],
        languageOptions: { parser: tseslint.parser },
        rules: { 'no-restricted-syntax': config.rules['no-restricted-syntax'] },
      },
    ],
    filePath,
  );
  return messages.some((message) => message.ruleId === 'no-restricted-syntax');
}

// The first look at eslint.config.mjs loads every plugin, which takes several seconds.
beforeAll(async () => {
  await eslint.calculateConfigForFile(publicPage);
}, CONFIG_LOAD_TIMEOUT_MS);

// CLAUDE.md §7.7: process.env is read in src/lib/env.ts and src/lib/public-env.ts; src/lib/public-literals.ts
// may inline NEXT_PUBLIC_* values by their literal names and nothing else (review of PR #32).
describe('process.env stays behind the env modules', () => {
  const literals = 'src/lib/public-literals.ts';

  it('refuses process.env in a component', async () => {
    expect(
      await isSyntaxRefused(
        'src/components/layout/site-header.tsx',
        'const url = process.env.NEXT_PUBLIC_SITE_URL;',
      ),
    ).toBe(true);
  });

  it('lets public-literals.ts read a NEXT_PUBLIC_* value by its literal name', async () => {
    expect(await isSyntaxRefused(literals, 'const url = process.env.NEXT_PUBLIC_SITE_URL;')).toBe(
      false,
    );
  });

  it('refuses a server value and a computed name in public-literals.ts', async () => {
    expect(
      await isSyntaxRefused(literals, 'const key = process.env.SUPABASE_SERVICE_ROLE_KEY;'),
    ).toBe(true);
    expect(
      await isSyntaxRefused(literals, "const url = process.env['NEXT_PUBLIC_SITE_URL'];"),
    ).toBe(true);
  });
});

describe('public pages read like a visitor', () => {
  it.each([
    "import { createSupabaseServerClient } from '@/lib/supabase/server';",
    "import { createSupabaseAnonClient } from '@/lib/supabase/anon';",
    "import { createSupabaseBrowserClient } from '@/lib/supabase/client';",
    "import { createServerClient } from '@supabase/ssr';",
    "import { createClient } from '@supabase/supabase-js';",
    "import { listPackages } from '@/server/services/package-service';",
    "import { cookies } from 'next/headers';",
  ])('a public page may not: %s', async (importLine) => {
    expect(await isRefused(publicPage, importLine)).toBe(true);
  });

  it('a public page reads through src/lib/queries', async () => {
    expect(
      await isRefused(publicPage, "import { getPackage } from '@/lib/queries/packages';"),
    ).toBe(false);
  });
});

describe('src/lib/queries uses the session-less anon client only', () => {
  it.each([
    "import { createSupabaseServerClient } from '@/lib/supabase/server';",
    "import { createSupabaseBrowserClient } from '@/lib/supabase/client';",
    "import { createServerClient } from '@supabase/ssr';",
    "import { cookies } from 'next/headers';",
    "import { createSupabaseAdminClient } from '@/lib/supabase/admin';",
  ])('a query may not: %s', async (importLine) => {
    expect(await isRefused(query, importLine)).toBe(true);
  });

  it('a query reads through the anon client', async () => {
    expect(
      await isRefused(query, "import { createSupabaseAnonClient } from '@/lib/supabase/anon';"),
    ).toBe(false);
  });

  it.each([
    'src/app/(admin)/dashboard/page.tsx',
    'src/components/packages/package-card.tsx',
    'src/server/actions/package.ts',
  ])('and nothing else imports that client: %s', async (filePath) => {
    expect(
      await isRefused(filePath, "import { createSupabaseAnonClient } from '@/lib/supabase/anon';"),
    ).toBe(true);
  });
});

describe('motion follows docs/StyleGuide.md §7', () => {
  const fullMotion = "import { motion } from 'motion/react';";
  const lazyMotion = "import { m } from 'motion/react';";

  it.each([
    'src/components/marketing/hero.tsx',
    'src/components/ui/tabs.tsx',
    'src/app/(public)/(lists)/page.tsx',
    'src/app/(admin)/dashboard/page.tsx',
  ])('the full motion component is refused in %s', async (filePath) => {
    expect(await isRefused(filePath, fullMotion)).toBe(true);
  });

  it('marketing components animate with m', async () => {
    expect(await isRefused('src/components/marketing/hero.tsx', lazyMotion)).toBe(false);
  });

  it.each([
    'src/components/admin/data-table/data-table.tsx',
    'src/components/forms/phone-input.tsx',
    'src/components/admin/shell/app-sidebar.tsx',
    'src/components/admin/charts/revenue-chart.tsx',
  ])('%s does not animate at all', async (filePath) => {
    expect(await isRefused(filePath, lazyMotion)).toBe(true);
    expect(await isRefused(filePath, "import * as m from 'motion/react-m';")).toBe(true);
  });

  it('the motion tokens may use the full motion component', async () => {
    expect(await isRefused('src/lib/motion/variants.ts', fullMotion)).toBe(false);
  });
});

// Fails when a file of docs/ carries the same `## ` heading twice (re-review of PR #70, M-1): a replacement that
// pasted the rest of a document into itself shows up as its sections repeated, long before anyone reads that far.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DOCS_DIR = 'docs';
const SECTION_HEADING = /^## .+$/gm;

export function duplicateHeadings(markdown) {
  const seen = new Set();
  const repeated = new Set();
  for (const [heading] of markdown.matchAll(SECTION_HEADING)) {
    const normalised = heading.trim();
    if (seen.has(normalised)) repeated.add(normalised);
    seen.add(normalised);
  }
  return [...repeated];
}

async function main() {
  const names = (await readdir(DOCS_DIR)).filter((name) => name.endsWith('.md')).sort();
  const problems = [];
  for (const name of names) {
    const repeated = duplicateHeadings(await readFile(join(DOCS_DIR, name), 'utf8'));
    for (const heading of repeated) problems.push(`${DOCS_DIR}/${name}: ${heading}`);
  }
  if (problems.length > 0) {
    process.stderr.write(`These section headings appear more than once:\n${problems.join('\n')}\n`);
    return 1;
  }
  process.stdout.write(`No repeated section heading in ${String(names.length)} documents.\n`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main();
}

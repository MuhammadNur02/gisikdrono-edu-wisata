// Fails when a file of docs/ carries the same `## ` heading twice (re-review of PR #70, M-1): a replacement that
// pasted the rest of a document into itself shows up as its sections repeated, long before anyone reads that far.
// Delta review of PR #80, D-1: it also fails when a document (docs/*.md and CLAUDE.md) has an odd number of code
// fences, or, outside a code block, the source of a replacement callback (`() =>`) or an escaped backtick, the marks a
// String.replace callback leaves when its text lands in a file instead of its result.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const DOCS_DIR = 'docs';
const ROOT_DOCUMENTS = ['CLAUDE.md'];
const SECTION_HEADING = /^## .+$/gm;
const FENCE = /^\s*```/;
const CALLBACK_MARKS = [
  { mark: '() =>', label: 'a callback "() =>"' },
  { mark: '\\`', label: 'an escaped backtick' },
];

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

// The problems of one document: an odd count of ``` fences, and the callback marks outside its code blocks, by line.
export function brokenMarkdown(markdown) {
  const problems = [];
  let fences = 0;
  markdown.split('\n').forEach((line, index) => {
    if (FENCE.test(line)) {
      fences += 1;
      return;
    }
    if (fences % 2 === 1) return;
    for (const { mark, label } of CALLBACK_MARKS) {
      if (line.includes(mark)) problems.push(`line ${String(index + 1)}: ${label} outside a code block`);
    }
  });
  if (fences % 2 === 1) problems.push(`${String(fences)} code fences, an odd number`);
  return problems;
}

async function documentPaths() {
  const names = (await readdir(DOCS_DIR)).filter((name) => name.endsWith('.md')).sort();
  return [...names.map((name) => join(DOCS_DIR, name)), ...ROOT_DOCUMENTS];
}

async function main() {
  const paths = await documentPaths();
  const problems = [];
  for (const path of paths) {
    const markdown = await readFile(path, 'utf8');
    if (path.startsWith(DOCS_DIR)) {
      for (const heading of duplicateHeadings(markdown)) problems.push(`${path}: repeated heading ${heading}`);
    }
    for (const problem of brokenMarkdown(markdown)) problems.push(`${path}: ${problem}`);
  }
  if (problems.length > 0) {
    process.stderr.write(`These documents look damaged:\n${problems.join('\n')}\n`);
    return 1;
  }
  process.stdout.write(
    `No repeated section heading, unbalanced fence or callback text in ${String(paths.length)} documents.\n`,
  );
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main();
}

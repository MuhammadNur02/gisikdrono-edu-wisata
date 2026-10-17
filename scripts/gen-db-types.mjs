// Regenerates src/db/types.ts from the local database (CLAUDE.md §6.3). A shell redirect empties the target before
// the CLI even starts, so a Postgres timeout used to leave a blank types.ts behind. The output now goes to a
// temporary file next to it and replaces types.ts only when the CLI exits cleanly with a real Database type.
import { spawn } from 'node:child_process';
import { rename, rm, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const TYPES_FILE = 'src/db/types.ts';
const GENERATE_COMMAND = ['supabase', ['gen', 'types', 'typescript', '--local']];
const DATABASE_TYPE_MARKER = 'export type Database';

export function isUsableTypesOutput(output) {
  return output.includes(DATABASE_TYPE_MARKER);
}

function runGenerator([command, args]) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'inherit'] });
    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.on('error', (error) => resolve({ exitCode: 1, output: '', error }));
    child.on('close', (exitCode) =>
      resolve({ exitCode: exitCode ?? 1, output: Buffer.concat(chunks).toString('utf8') }),
    );
  });
}

export async function replaceTypesFile({ target, generate }) {
  const { exitCode, output, error } = await generate();
  if (exitCode !== 0 || !isUsableTypesOutput(output)) {
    const reason = error ? error.message : `exit code ${String(exitCode)}`;
    return { replaced: false, reason };
  }

  const temporaryFile = `${target}.${String(process.pid)}.tmp`;
  try {
    await writeFile(temporaryFile, output, 'utf8');
    await rename(temporaryFile, target);
  } finally {
    await rm(temporaryFile, { force: true });
  }
  return { replaced: true };
}

async function main() {
  const result = await replaceTypesFile({
    target: TYPES_FILE,
    generate: () => runGenerator(GENERATE_COMMAND),
  });
  if (!result.replaced) {
    process.stderr.write(
      `Type generation failed (${result.reason}); ${TYPES_FILE} was left as it was.\n`,
    );
    return 1;
  }
  process.stdout.write(`Wrote ${TYPES_FILE}.\n`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main();
}

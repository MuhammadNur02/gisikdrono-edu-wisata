// Run after `pnpm build`: fails when anything the browser downloads carries a server-side secret
// (docs/Security.md PAY-01, SEC-01). The service-role key and Midtrans server key must never ship.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const CLIENT_BUNDLE_DIR = '.next/static';
// 'Mid-server-' matches every Midtrans server key: live keys and both sandbox formats (SB-Mid-server- and the
// newer Mid-server-), so it stays here even though SB-Mid-server- is listed too.
const SECRET_FINGERPRINTS = [
  'Mid-server-',
  'SB-Mid-server-',
  'service_role',
  'MIDTRANS_SERVER_KEY',
];

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

async function findLeaks(files) {
  const leaks = [];
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    for (const fingerprint of SECRET_FINGERPRINTS) {
      if (content.includes(fingerprint)) leaks.push(`${file}: contains "${fingerprint}"`);
    }
  }
  return leaks;
}

async function main() {
  const files = await listFiles(CLIENT_BUNDLE_DIR).catch(() => null);
  if (files === null) {
    process.stderr.write(`${CLIENT_BUNDLE_DIR} not found. Run \`pnpm build\` first.\n`);
    return 1;
  }

  const leaks = await findLeaks(files);
  if (leaks.length > 0) {
    process.stderr.write(`Server secrets found in the client bundle:\n${leaks.join('\n')}\n`);
    return 1;
  }

  process.stdout.write(`Client bundle clean: ${String(files.length)} files checked.\n`);
  return 0;
}

process.exitCode = await main();

import { parseArgs } from 'node:util';

import { seedDemoMedia } from './demo-media';
import { seedOfficialMedia } from './official-media';
import {
  DEFAULT_CREDENTIALS_FILE,
  STAGING_PROJECT_NAME,
  openStagingTarget,
} from './staging-target';

// pnpm db:seed:staging-media -- --media <folder> --official-media <folder> [--credentials <file>]: the photo
// sets of pnpm db:seed --media / --official-media, written to the staging project so its pages stop showing
// `Foto menyusul` (docs/runbooks/staging-setup.md, D.7). The same uploads and the same SQL as the local seed:
// existing rows and photos someone already set are kept, and a second run changes nothing. It writes no
// development account, no demo booklet and no other content; scripts/staging-target.ts refuses any project
// that is not staging before the first write.

// pnpm passes a `--` through when the caller writes one, so it is dropped before parsing.
const [, , ...scriptArgs] = process.argv;
const { values } = parseArgs({
  args: scriptArgs.filter((arg) => arg !== '--'),
  options: {
    media: { type: 'string' },
    'official-media': { type: 'string' },
    credentials: { type: 'string' },
  },
});
const mediaFolder = values.media;
const officialFolder = values['official-media'];
if (mediaFolder === undefined && officialFolder === undefined) {
  throw new Error('pass --media <folder>, --official-media <folder>, or both');
}

const log = (line: string): void => {
  process.stdout.write(`${line}\n`);
};
const credentialsFile = values.credentials ?? DEFAULT_CREDENTIALS_FILE;
const target = await openStagingTarget(credentialsFile, { log });
log(
  `Guards passed: project ${STAGING_PROJECT_NAME}, Vault environment staging. Credentials from ${credentialsFile}`,
);

// The development photos first, as locally, so an RW page or a point that shows one of them keeps it.
if (mediaFolder !== undefined) {
  log(
    `Demo photos: ${String(await seedDemoMedia(target, mediaFolder))} placed from ${mediaFolder}`,
  );
}
if (officialFolder !== undefined) {
  log(
    `Official-site photos: ${String(await seedOfficialMedia(target, officialFolder))} placed from ${officialFolder}`,
  );
}
log('Done. Delete the credentials file now (docs/runbooks/staging-setup.md, D.7).');

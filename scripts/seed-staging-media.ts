import { parseArgs } from 'node:util';

import { seedDemoGallery } from './demo-media';
import { seedOfficialHeroBanner, seedOfficialMedia } from './official-media';
import {
  DEFAULT_CREDENTIALS_FILE,
  STAGING_PROJECT_NAME,
  openStagingTarget,
} from './staging-target';

// pnpm db:seed:staging-media -- --media <folder> --official-media <folder> [--credentials <file>]: the photo
// sets of pnpm db:seed --media / --official-media, written to the staging project so its pages stop showing
// `Foto menyusul` (docs/runbooks/staging-setup.md, D.7). The same uploads and the same SQL as the local seed:
// existing rows and photos someone already set are kept, and a second run changes nothing.
// Privacy (decision of 2026-10-24): the development photos, whose consent is still pending, go into the gallery
// only; the home hero, the RW page heroes and the activity points come from the kelurahan's own published
// photos. It writes no development account, no demo booklet and no other content; scripts/staging-target.ts
// refuses any project that is not staging before the first write.

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

if (mediaFolder !== undefined) {
  const placed = await seedDemoGallery(target, mediaFolder);
  log(`Demo photos (gallery only): ${String(placed)} placed from ${mediaFolder}`);
}
if (officialFolder !== undefined) {
  const placed = await seedOfficialMedia(target, officialFolder);
  await seedOfficialHeroBanner(target, officialFolder);
  log(`Official-site photos: ${String(placed)} placed, plus the home hero, from ${officialFolder}`);
}
log('Done. Delete the credentials file now (docs/runbooks/staging-setup.md, D.7).');

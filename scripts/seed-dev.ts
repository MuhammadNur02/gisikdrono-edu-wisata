import { mediaFoldersFromArgs, seedDemoMedia } from './demo-media';
import { DEV_ACCOUNTS, DEV_ONLY_PASSWORD, DEV_ONLY_TOTP_SECRET, totpCode } from './dev-accounts';
import { devSeedSql } from './dev-seed-sql';
import { localStack, runSql, sqlText } from './local-stack';
import { seedOfficialMedia } from './official-media';

// pnpm db:seed (Task P1.8.02): writes the development staff accounts of scripts/seed-dev.sql and the demo content of
// scripts/seed-demo-content.sql into the local stack, then prints how to sign in with the TOTP code of this moment.
// localStack refuses anything but 127.0.0.1, and the SQL refuses a database marked anything but local, so the
// DEV-ONLY credentials never reach a hosted project. pnpm db:reset runs it after the migrations; running it again
// changes nothing.
// pnpm db:seed --media <folder> also uploads the development photos of scripts/demo-media.ts from that folder, and
// --official-media <folder> the photos of the kelurahan's own site named in scripts/official-media.ts.

const seedSql = devSeedSql();
// process.argv starts with the node binary and this script; the options follow.
const [, , ...scriptArgs] = process.argv;
const folders = mediaFoldersFromArgs(scriptArgs);

// One query string is one transaction in Postgres, so the settings below last exactly as long as the seed and a
// failure anywhere leaves the database as it was.
await runSql(`select set_config('dev_seed.password', ${sqlText(DEV_ONLY_PASSWORD)}, true),
                     set_config('dev_seed.totp_secret', ${sqlText(DEV_ONLY_TOTP_SECRET)}, true);
${seedSql}`);

// After the SQL, which has already refused any database not marked local. The development photos go first, so
// an RW page or an activity point that shows one of them keeps it.
const mediaLine =
  folders.media === undefined
    ? 'Demo photos: none (pass --media <folder> to upload them; pages show Foto menyusul meanwhile)'
    : `Demo photos: ${String(await seedDemoMedia(folders.media))} uploaded from ${folders.media}`;
const officialMediaLine =
  folders.officialMedia === undefined
    ? 'Official-site photos: none (pass --official-media <folder> to upload them)'
    : `Official-site photos: ${String(await seedOfficialMedia(folders.officialMedia))} uploaded from ${folders.officialMedia}`;

const lines = [
  `Local development accounts on ${localStack().apiUrl}:`,
  ...DEV_ACCOUNTS.map(
    (account) =>
      `  ${account.email}  ${account.role}${account.rwId === null ? '' : ` RW ${String(account.rwId)}`}`,
  ),
  `Password: ${DEV_ONLY_PASSWORD}`,
  `TOTP secret: ${DEV_ONLY_TOTP_SECRET} (add it to an authenticator app once)`,
  `TOTP code now: ${totpCode(DEV_ONLY_TOTP_SECRET)}`,
  mediaLine,
  officialMediaLine,
];
process.stdout.write(`${lines.join('\n')}\n`);

import { readFileSync } from 'node:fs';

import { DEV_ACCOUNTS, DEV_ONLY_PASSWORD, DEV_ONLY_TOTP_SECRET, totpCode } from './dev-accounts';
import { localStack, runSql } from './local-stack';

// pnpm db:seed (Task P1.8.02): writes the development staff accounts and the demo content of scripts/seed-dev.sql
// into the local stack, then prints how to sign in with the TOTP code of this moment. localStack refuses anything
// but 127.0.0.1, and the SQL refuses a database marked anything but local, so the DEV-ONLY credentials never reach
// a hosted project. pnpm db:reset runs it after the migrations; running it again changes nothing.

const seedSql = readFileSync(new URL('./seed-dev.sql', import.meta.url), 'utf8');

function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

// One query string is one transaction in Postgres, so the settings below last exactly as long as the seed and a
// failure anywhere leaves the database as it was.
await runSql(`select set_config('dev_seed.password', ${sqlText(DEV_ONLY_PASSWORD)}, true),
                     set_config('dev_seed.totp_secret', ${sqlText(DEV_ONLY_TOTP_SECRET)}, true);
${seedSql}`);

const lines = [
  `Local development accounts on ${localStack().apiUrl}:`,
  ...DEV_ACCOUNTS.map(
    (account) =>
      `  ${account.email}  ${account.role}${account.rwId === null ? '' : ` RW ${String(account.rwId)}`}`,
  ),
  `Password: ${DEV_ONLY_PASSWORD}`,
  `TOTP secret: ${DEV_ONLY_TOTP_SECRET} (add it to an authenticator app once)`,
  `TOTP code now: ${totpCode(DEV_ONLY_TOTP_SECRET)}`,
];
process.stdout.write(`${lines.join('\n')}\n`);

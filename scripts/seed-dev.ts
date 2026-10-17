import {
  DEV_ACCOUNTS,
  DEV_ONLY_PASSWORD,
  DEV_ONLY_TOTP_SECRET,
  isLocalSupabaseUrl,
  totpCode,
} from './dev-accounts';
import { publicEnv } from '../src/lib/public-env';

// pnpm db:seed: prints how to sign in as the development staff accounts that supabase/seed.sql wrote during
// `pnpm db:reset`, with the TOTP code of this moment. It refuses to run against anything but the local stack.
const supabaseUrl = publicEnv.NEXT_PUBLIC_SUPABASE_URL;
if (!isLocalSupabaseUrl(supabaseUrl)) {
  process.stderr.write(
    `db:seed refuses ${supabaseUrl}: it is only for the local stack on 127.0.0.1.\n`,
  );
  process.exit(1);
}

const code = totpCode(DEV_ONLY_TOTP_SECRET);
const lines = [
  'Local development accounts (written by supabase/seed.sql on pnpm db:reset):',
  ...DEV_ACCOUNTS.map(
    (account) =>
      `  ${account.email}  ${account.role}${account.rwId === null ? '' : ` RW ${String(account.rwId)}`}`,
  ),
  `Password: ${DEV_ONLY_PASSWORD}`,
  `TOTP secret: ${DEV_ONLY_TOTP_SECRET} (add it to an authenticator app once)`,
  `TOTP code now: ${code}`,
];
process.stdout.write(`${lines.join('\n')}\n`);

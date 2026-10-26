// A bank account as the superadmin sees it by default (Task P4.3.06): the number masked by
// internal.masked_account_number. The full number only ever comes back from a reveal, to the page that asked.
export interface MaskedBankAccount {
  bankName: string | null;
  accountHolder: string | null;
  accountMasked: string | null;
}

// One RW treasury on /dashboard/settings.
export interface RwTreasuryAccount {
  rwId: number;
  rwName: string;
  // null when it could not be read; the page shows the others.
  account: MaskedBankAccount | null;
}

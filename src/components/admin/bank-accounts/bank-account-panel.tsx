'use client';

import { Eye, EyeOff, Pencil } from 'lucide-react';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';

import {
  EditAccountForm,
  RevealNumberForm,
  type BankAccountActions,
} from '@/components/admin/bank-accounts/bank-account-forms';
import { FormAlert } from '@/components/forms/form-alert';
import { Button } from '@/components/ui/button';
import { bankAccountsCopy } from '@/lib/copy/bank-accounts';
import type { BankAccountTarget } from '@/lib/validations/bank-account';
import type { MaskedBankAccount } from '@/types/bank-account';

const text = bankAccountsCopy;

type Mode = 'view' | 'reveal' | 'edit';

function AccountFacts({
  account,
  revealed,
}: {
  account: MaskedBankAccount;
  revealed: string | null;
}) {
  const facts = [
    { label: text.bankName, value: account.bankName },
    { label: text.accountNumber, value: revealed ?? account.accountMasked },
    { label: text.accountHolder, value: account.accountHolder },
  ];
  return (
    <dl className="grid gap-2 text-body-sm sm:grid-cols-3">
      {facts.map((fact) => (
        <div key={fact.label}>
          <dt className="text-caption text-muted-foreground">{fact.label}</dt>
          <dd className="font-medium tabular-nums">{fact.value ?? text.notSet}</dd>
        </div>
      ))}
    </dl>
  );
}

function ViewButtons({
  hasNumber,
  isRevealed,
  onReveal,
  onHide,
  onEdit,
}: {
  hasNumber: boolean;
  isRevealed: boolean;
  onReveal: () => void;
  onHide: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      {hasNumber ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={isRevealed ? onHide : onReveal}
        >
          {isRevealed ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
          {isRevealed ? text.hide : text.reveal}
        </Button>
      ) : null}
      <Button type="button" variant="ghost" className="min-h-11" onClick={onEdit}>
        <Pencil aria-hidden />
        {text.edit}
      </Button>
    </div>
  );
}

// The masked account, read once through the load action when the page did not hand it in.
function useMaskedAccount(
  target: BankAccountTarget,
  initial: MaskedBankAccount | null,
  actions: BankAccountActions,
) {
  const [account, setAccount] = useState(initial);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [isLoading, startTransition] = useTransition();
  const reload = useCallback(() => {
    startTransition(async () => {
      const result = await actions.load({ target });
      if (result.ok) setAccount(result.data);
      else setRefusal(result.error.message);
    });
  }, [actions, target]);
  const isMissing = account === null && refusal === null;
  useEffect(() => {
    if (isMissing) reload();
  }, [isMissing, reload]);
  return { account, refusal, isLoading, reload };
}

export interface BankAccountPanelProps {
  target: BankAccountTarget;
  // The masked account when the page read it; null loads it on first render (the vendors sheet).
  initial: MaskedBankAccount | null;
  actions: BankAccountActions;
}

interface ModeProps {
  mode: Mode;
  target: BankAccountTarget;
  account: MaskedBankAccount;
  revealed: string | null;
  actions: BankAccountActions;
  setMode: (mode: Mode) => void;
  setRevealed: (accountNumber: string | null) => void;
  onSaved: () => void;
}

// The buttons under the account: show or hide the number, or change the account.
function ViewMode({ account, revealed, setMode, setRevealed }: ModeProps) {
  return (
    <ViewButtons
      hasNumber={account.accountMasked !== null}
      isRevealed={revealed !== null}
      onReveal={() => {
        setMode('reveal');
      }}
      onHide={() => {
        setRevealed(null);
      }}
      onEdit={() => {
        setRevealed(null);
        setMode('edit');
      }}
    />
  );
}

// What sits under the account: its buttons, the reveal form or the change form.
function ModeContent(props: ModeProps) {
  const { mode, target, account, actions, setMode, setRevealed, onSaved } = props;
  const backToView = () => {
    setMode('view');
  };
  if (mode === 'reveal') {
    const onRevealed = (accountNumber: string | null) => {
      setRevealed(accountNumber);
      backToView();
    };
    return (
      <RevealNumberForm
        target={target}
        actions={actions}
        onRevealed={onRevealed}
        onCancel={backToView}
      />
    );
  }
  if (mode === 'view') return <ViewMode {...props} />;
  const saved = () => {
    backToView();
    onSaved();
  };
  return (
    <EditAccountForm
      target={target}
      account={account}
      actions={actions}
      onSaved={saved}
      onCancel={backToView}
    />
  );
}

// Task P4.3.06: one vendor's or RW treasury's account for the superadmin, masked; the full number only after a reason
// and a fresh authenticator code, kept in this component until hidden; a change with a fresh code too.
export function BankAccountPanel({ target, initial, actions }: BankAccountPanelProps) {
  const { account, refusal, isLoading, reload } = useMaskedAccount(target, initial, actions);
  const [mode, setMode] = useState<Mode>('view');
  const [revealed, setRevealed] = useState<string | null>(null);
  if (refusal) return <FormAlert tone="info">{refusal}</FormAlert>;
  if (account === null || isLoading) {
    return <p className="text-body-sm text-muted-foreground">{text.loading}</p>;
  }
  const onSaved = () => {
    toast.success(text.saved);
    reload();
  };
  return (
    <div className="space-y-3">
      <AccountFacts account={account} revealed={revealed} />
      {revealed ? <p className="text-caption text-muted-foreground">{text.revealedNote}</p> : null}
      <ModeContent
        mode={mode}
        target={target}
        account={account}
        revealed={revealed}
        actions={actions}
        setMode={setMode}
        setRevealed={setRevealed}
        onSaved={onSaved}
      />
    </div>
  );
}

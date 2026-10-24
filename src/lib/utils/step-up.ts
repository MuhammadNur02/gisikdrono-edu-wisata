import type { ActionResult } from '@/types/action-result';

// docs/Security.md §5.3 (AUTH-11): a privileged form carries the authenticator code next to its own fields. The code
// goes to verifyStaffTotpAction first, which refreshes the session's TOTP time; only then do the other fields go to
// the form's own action, whose guard and RPC check that time again. A wrong code stops here with its field error.

type FormAction<TData> = (values: unknown) => Promise<ActionResult<TData>>;

const CODE_FIELD = 'code';

function splitCode(values: unknown): { code: unknown; rest: Record<string, unknown> } {
  if (typeof values !== 'object' || values === null) return { code: undefined, rest: {} };
  const entries = Object.entries(values);
  return {
    code: entries.find(([key]) => key === CODE_FIELD)?.[1],
    rest: Object.fromEntries(entries.filter(([key]) => key !== CODE_FIELD)),
  };
}

export function withStepUp<TData>(
  stepUp: FormAction<null>,
  action: FormAction<TData>,
): FormAction<TData> {
  return async (values) => {
    const { code, rest } = splitCode(values);
    const check = await stepUp({ code });
    if (!check.ok) return check;
    return action(rest);
  };
}

import type { SendResult } from '@/lib/notifications/types';

export type SendFailure = Extract<SendResult, { ok: false }>;

// A provider's refusal in the server's own words. isPermanent: trying again would meet the same refusal.
export function sendFailure(errorCode: string, error: string, isPermanent: boolean): SendFailure {
  return { ok: false, errorCode, error, isPermanent };
}

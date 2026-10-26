import { EMAIL_LINK_TYPES, type EmailLinkType } from '@/config/auth';

// The token_hash and type of a Supabase Auth email link, as /auth/callback and /auth/continue read them: a known kind
// and a token of a sane length, or nothing. Neither says anything about whether the link is still unused.

const TOKEN_HASH_MAX_LENGTH = 512;

export interface EmailLink {
  type: EmailLinkType;
  tokenHash: string;
}

function isEmailLinkType(value: unknown): value is EmailLinkType {
  return EMAIL_LINK_TYPES.some((type) => type === value);
}

export function parseEmailLink(tokenHash: unknown, type: unknown): EmailLink | null {
  if (typeof tokenHash !== 'string' || tokenHash === '' || tokenHash.length > TOKEN_HASH_MAX_LENGTH)
    return null;
  return isEmailLinkType(type) ? { type, tokenHash } : null;
}

export function emailLinkQuery(link: EmailLink): string {
  return new URLSearchParams({ token_hash: link.tokenHash, type: link.type }).toString();
}

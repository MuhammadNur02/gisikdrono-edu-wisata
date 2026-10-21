import 'server-only';

import { serverEnv } from '@/lib/env';

// The one key behind every guest link and the visitor's signed cookies (CLAUDE.md §7.5). Each kind of token signs
// under its own label, so a value made for one can never pass as another. Web Crypto rather than node:crypto, because
// src/middleware.ts runs on the Edge runtime and checks a link's signature before it stores the link (review of
// PR #20, L2); crypto.subtle.verify compares the signature in constant time, as timingSafeEqual does.
export type SignatureLabel = 'gsk-guest-link-v1' | 'gsk-phone-proof-v1';

// HMAC-SHA256 gives 32 bytes, 43 base64url characters; anything else is refused before it is decoded, and the length
// of a genuine signature is no secret.
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const encoder = new TextEncoder();

function signingKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(serverEnv.BOOKING_LINK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function labelled(label: SignatureLabel, message: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(`${label}\n${message}`);
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function sign(label: SignatureLabel, message: string): Promise<string> {
  const signature = await crypto.subtle.sign('HMAC', await signingKey(), labelled(label, message));
  return toBase64Url(new Uint8Array(signature));
}

export async function hasValidSignature(
  label: SignatureLabel,
  message: string,
  presented: string,
): Promise<boolean> {
  if (!SIGNATURE_PATTERN.test(presented)) return false;
  const given = fromBase64Url(presented);
  return crypto.subtle.verify('HMAC', await signingKey(), given, labelled(label, message));
}

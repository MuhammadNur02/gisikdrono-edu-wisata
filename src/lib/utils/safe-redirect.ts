const SAME_SITE_PATH = /^\/(?![/\\])/;
// Browsers drop tabs and newlines inside URLs, so "/\t/evil.test" would turn into "//evil.test".
const CONTROL_OR_WHITESPACE = /[\s\p{Cc}]/u;

// Only lets a redirect go to a path on this site, never to another host (CLAUDE.md §7.8).
export function safeRedirect(target: string | null | undefined, fallback = '/'): string {
  if (!target) return fallback;
  if (!SAME_SITE_PATH.test(target) || CONTROL_OR_WHITESPACE.test(target)) return fallback;
  return target;
}

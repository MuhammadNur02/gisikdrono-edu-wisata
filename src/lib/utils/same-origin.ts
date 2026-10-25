// Next.js checks the Origin of a Server Action but not of a route handler, so a staff route that changes
// something compares the Origin header with its own host (docs/Security.md APP-12). The host is read the way
// Next.js reads it for Server Actions, x-forwarded-host first and then host: a route handler's request.url names
// the address the server listens on (localhost in development), not the one the browser used. The session cookie
// is SameSite=Lax as well; this is the second lock, and a request without an Origin is refused.
function requestHost(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('host') || new URL(request.url).host;
}

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (origin === null || !URL.canParse(origin)) return false;
  return new URL(origin).host === requestHost(request);
}

// A GET from a link on the site's own pages. A browser sends no Origin on a plain navigation, but it does send
// Sec-Fetch-Site; a request with neither, or from another site, is refused (review of PR #63, Low).
export function isSameOriginNavigation(request: Request): boolean {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite !== null) return fetchSite === 'same-origin';
  return isSameOriginRequest(request);
}

// Next.js checks the Origin of a Server Action but not of a route handler, so a staff route that changes
// something compares the Origin header with its own address (docs/Security.md APP-12). The session cookie is
// SameSite=Lax as well; this is the second lock, and a request without an Origin is refused.
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get('origin');
  return origin !== null && origin === new URL(request.url).origin;
}

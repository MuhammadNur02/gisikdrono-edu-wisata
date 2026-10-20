const SEE_OTHER = 303;

// A 303 to a path on this site, with a relative Location the browser resolves against the address it used. A route
// handler's request.url names the address the server listens on (localhost in development), so an absolute URL
// built from it could send the browser to another host, where its auth cookies do not exist.
export function seeOther(path: string): Response {
  return new Response(null, { status: SEE_OTHER, headers: { Location: path } });
}

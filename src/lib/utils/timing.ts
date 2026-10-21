// Holds an answer back until minimumMs have passed since startedAt (Date.now()), so a quick "nothing found" takes as
// long as a slower "found and sent" (docs/Security.md GUEST-01).
export async function waitUntilElapsed(startedAt: number, minimumMs: number): Promise<void> {
  const remainingMs = startedAt + minimumMs - Date.now();
  if (remainingMs <= 0) return;
  await new Promise<void>((resolve) => {
    setTimeout(resolve, remainingMs);
  });
}

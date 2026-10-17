// True for the prefix itself and every page below it, so /pesan matches /pesan/x but never /pesanan.
export function isPathUnder(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

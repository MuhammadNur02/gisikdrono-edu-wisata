import { SCANNER_PATH } from '@/config/dashboard';
import { isPathUnder } from '@/lib/utils/paths';

// CLAUDE.md §7.4, docs/Security.md HDR-03: camera=(self) and 'wasm-unsafe-eval' belong to the document of
// /dashboard/scanner alone. A browser keeps the policies of the document it first loaded through every client-side
// navigation, so a move into or out of the scanner has to load a new document; a move between two other dashboard
// pages stays a client navigation.
export function crossesScannerBoundary(fromPath: string, toPath: string): boolean {
  return isPathUnder(fromPath, SCANNER_PATH) !== isPathUnder(toPath, SCANNER_PATH);
}

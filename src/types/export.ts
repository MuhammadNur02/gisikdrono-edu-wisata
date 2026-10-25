import type { ExportFormat } from '@/config/exports';
import type { RwId } from '@/config/rw';
import type { EnumValue } from '@/db/enums';

// One row of the /dashboard/exports history (Task P4.6.03): plain values only, they cross into the client table.
export interface ExportListItem {
  id: string;
  kind: EnumValue<'export_kind'>;
  format: ExportFormat | 'pdf';
  periodFrom: string | null;
  periodTo: string | null;
  // NULL: every RW the export could cover.
  rwId: RwId | null;
  rowCount: number | null;
  purpose: string | null;
  requestedByName: string | null;
  createdAt: string;
  expiresAt: string;
  // The file is still there and its 24 hours have not run out, so it can be downloaded again.
  isAvailable: boolean;
  // Its file was never stored (too big, or Storage refused it); the hourly cap gave its hit back.
  hasFailed: boolean;
}

// What POST /api/export/[kind] answers: the 300-second link to the file just written, never stored anywhere.
export interface CreatedExport {
  exportId: string;
  rowCount: number;
  url: string;
}

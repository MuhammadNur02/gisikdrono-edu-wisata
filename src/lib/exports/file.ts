import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';

import { EXPORT_CONTENT_TYPES, EXPORT_FOLDER, type ExportFormat } from '@/config/exports';
import { APP_TZ } from '@/config/site';
import type { ExportKind } from '@/lib/exports/columns';

// Where an export file lives and what it is called (CLAUDE.md §6.6, 0003_tables.sql): documents/exports/<profile_id>/
// <yyyymmdd-hhmmss>-<kind>-<export_id>.<ext>, the time in Semarang. The export's own id keeps two exports made in the
// same second apart (review of PR #63, M2). Every segment is letters, digits and hyphens, the shape
// document-service.ts signs. Pure.

const STAMP_FORMAT = 'yyyyMMdd-HHmmss';
// The export id at the end of a stored file's name, which the saved copy leaves out.
const EXPORT_ID_SUFFIX = /-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}(?=\.[a-z]+$)/;

function stampOf(at: Date): string {
  return format(new TZDate(at.getTime(), APP_TZ), STAMP_FORMAT);
}

export function exportFileName(
  kind: ExportKind,
  exportFormat: ExportFormat,
  at: Date,
  exportId: string,
): string {
  return `${stampOf(at)}-${kind}-${exportId}.${exportFormat}`;
}

export function exportStoragePath(profileId: string, fileName: string): string {
  return `${EXPORT_FOLDER}/${profileId}/${fileName}`;
}

// The name the browser saves the file under: `ekspor-20261025-093000-attendance.csv`.
export function exportDownloadName(storagePath: string): string {
  const fileName = storagePath.split('/').at(-1) ?? storagePath;
  return `ekspor-${fileName.replace(EXPORT_ID_SUFFIX, '')}`;
}

export function exportContentType(exportFormat: ExportFormat): string {
  return EXPORT_CONTENT_TYPES[exportFormat];
}

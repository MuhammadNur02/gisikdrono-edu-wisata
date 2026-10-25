import 'server-only';

import { z } from 'zod';

import { rwLabel } from '@/config/rw';
import { EDITABLE_SETTING_KEYS } from '@/config/site-settings';
import type { EnumValue } from '@/db/enums';
import type { DatabaseClient } from '@/db/rpc-result';
import {
  certificateVerifyUrl,
  type CertificateDocumentInput,
  type CertificatePageInput,
} from '@/lib/pdf/certificate';
import { isPlaceholderSetting } from '@/lib/queries/settings';

// What a certificate's page prints, read with the service role (Task P4.5.02): the recipient's name and the verify
// code, which no API role reads (0005), the participant's class, the names of the RWs and the kelurahan's signatory,
// a private site setting. The client is handed in by document-service.ts; every query is by the ids of certificates
// whose reader was already authorised.

export interface CertificateRow {
  id: string;
  bookingId: string;
  kind: EnumValue<'certificate_kind'>;
  certificateNumber: string;
  status: EnumValue<'certificate_status'>;
  institutionName: string | null;
  releasedAt: string | null;
  purgedAt: string | null;
  pdfPath: string | null;
}

export const CERTIFICATE_ROW_COLUMNS =
  'id, booking_id, kind, certificate_number, status, institution_name, released_at, purged_at, pdf_path';

type CertificateRowData = {
  id: string;
  booking_id: string;
  kind: EnumValue<'certificate_kind'>;
  certificate_number: string;
  status: EnumValue<'certificate_status'>;
  institution_name: string | null;
  released_at: string | null;
  purged_at: string | null;
  pdf_path: string | null;
};

export function toCertificateRow(row: CertificateRowData): CertificateRow {
  return {
    id: row.id,
    bookingId: row.booking_id,
    kind: row.kind,
    certificateNumber: row.certificate_number,
    status: row.status,
    institutionName: row.institution_name,
    releasedAt: row.released_at,
    purgedAt: row.purged_at,
    pdfPath: row.pdf_path,
  };
}

const PAGE_COLUMNS =
  'id, kind, certificate_number, verify_code, recipient_name, institution_name, visit_date, rw_ids, booking_participants(group_label)';

const signatorySchema = z
  .string()
  .transform((value) => (isPlaceholderSetting(value) ? null : value));

async function readSignatory(
  adminClient: DatabaseClient,
): Promise<Pick<CertificateDocumentInput, 'signatoryName' | 'signatoryTitle'>> {
  const keys = [EDITABLE_SETTING_KEYS.signatoryName, EDITABLE_SETTING_KEYS.signatoryTitle];
  const { data, error } = await adminClient
    .from('site_settings')
    .select('key, value')
    .in('key', keys);
  if (error) throw error;
  const valueOf = (key: string) => {
    const parsed = signatorySchema.safeParse(data.find((row) => row.key === key)?.value);
    return parsed.success ? parsed.data : null;
  };
  return {
    signatoryName: valueOf(EDITABLE_SETTING_KEYS.signatoryName),
    signatoryTitle: valueOf(EDITABLE_SETTING_KEYS.signatoryTitle),
  };
}

async function readRwNames(
  adminClient: DatabaseClient,
  rwIds: readonly number[],
): Promise<Map<number, string>> {
  const { data, error } = await adminClient
    .from('rw_units')
    .select('id, name')
    .in('id', [...new Set(rwIds)]);
  if (error) throw error;
  return new Map(data.map((unit) => [unit.id, unit.name]));
}

// The document input of these certificates, one page each in the order of their numbers, which is the list order for
// participants (internal.insert_participant_certificates).
export async function loadCertificatePages(
  adminClient: DatabaseClient,
  certificateIds: readonly string[],
  siteUrl: string,
): Promise<CertificateDocumentInput & { ids: string[] }> {
  const { data, error } = await adminClient
    .from('certificates')
    .select(PAGE_COLUMNS)
    .in('id', [...certificateIds])
    .order('certificate_number');
  if (error) throw error;
  const [signatory, rwNames] = await Promise.all([
    readSignatory(adminClient),
    readRwNames(
      adminClient,
      data.flatMap((row) => row.rw_ids),
    ),
  ]);
  const pages: CertificatePageInput[] = data.map((row) => ({
    kind: row.kind,
    certificateNumber: row.certificate_number,
    recipientName: row.recipient_name,
    groupLabel: row.booking_participants?.group_label ?? null,
    institutionName: row.institution_name,
    visitDate: row.visit_date,
    rwNames: row.rw_ids.map((rwId) => rwNames.get(rwId) ?? rwLabel(rwId)),
    verifyUrl: certificateVerifyUrl(siteUrl, row.verify_code),
  }));
  return { ...signatory, pages, ids: data.map((row) => row.id) };
}

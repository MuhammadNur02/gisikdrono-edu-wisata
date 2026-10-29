import 'server-only';

import { z } from 'zod';

import { cachedPublicRead, rowsOf } from '@/lib/queries/public-read';
import { TAGS } from '@/lib/queries/tags';
import { createSupabaseAnonClient } from '@/lib/supabase/anon';
import type { PublicSiteSettings } from '@/types/settings';

// The same three shapes internal.placeholder_site_settings() flags (0008_seed.sql): an example.invalid
// address, an all-zero phone number and a `[fill me in]` text. Until the kelurahan replaces one, the site
// shows nothing rather than the sample.
const PLACEHOLDER_PATTERNS = [/example\.invalid/i, /^\+620+$/, /^\[.*\]$/];

export function isPlaceholderSetting(value: string): boolean {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

const contactValue = z.string().transform((value) => (isPlaceholderSetting(value) ? null : value));

// Keys as docs/PRD.md §8.6 names them; site_settings_public_keys lets no other key be public.
const publicSettingsSchema = z.object({
  booking_enabled: z.boolean(),
  maintenance_mode: z.boolean(),
  'booking.min_lead_hours': z.number().int().nonnegative(),
  'booking.max_advance_days': z.number().int().positive(),
  'booking.max_pax': z.number().int().positive(),
  'contact.whatsapp_number': contactValue,
  'contact.email': contactValue,
  'kelurahan.address': contactValue,
  'contact.kopdes_whatsapp_number': contactValue,
  'contact.kopdes_address': contactValue,
  'seo.default_description': z.string(),
  'privacy.dpo_name': contactValue,
  'privacy.dpo_email': contactValue,
});

export function parsePublicSettings(rows: { key: string; value: unknown }[]): PublicSiteSettings {
  const values = publicSettingsSchema.parse(
    Object.fromEntries(rows.map((row) => [row.key, row.value])),
  );
  return {
    bookingEnabled: values.booking_enabled,
    maintenanceMode: values.maintenance_mode,
    minLeadHours: values['booking.min_lead_hours'],
    maxAdvanceDays: values['booking.max_advance_days'],
    maxPax: values['booking.max_pax'],
    contactWhatsappNumber: values['contact.whatsapp_number'],
    contactEmail: values['contact.email'],
    kelurahanAddress: values['kelurahan.address'],
    kopdesWhatsappNumber: values['contact.kopdes_whatsapp_number'],
    kopdesAddress: values['contact.kopdes_address'],
    seoDefaultDescription: values['seo.default_description'],
    dpoName: values['privacy.dpo_name'],
    dpoEmail: values['privacy.dpo_email'],
  };
}

// The anon policy returns the public keys only, whatever the select asks for.
export const getPublicSiteSettings = cachedPublicRead(
  async (): Promise<PublicSiteSettings> => {
    const result = await createSupabaseAnonClient().from('site_settings').select('key, value');
    return parsePublicSettings(rowsOf(result, 'site_settings'));
  },
  ['settings', 'public'],
  [TAGS.settings],
);

// The typed accessor for one public setting (Task P4.9.01, CLAUDE.md §4 rule 3), through the same cached read and its
// `settings` tag, so a save on /dashboard/settings reaches every caller. A private key is read by the database's own
// functions or, for the superadmin, by settings-service.ts; it never passes through the anon client.
export async function getSiteSetting<Key extends keyof PublicSiteSettings>(
  key: Key,
): Promise<PublicSiteSettings[Key]> {
  return (await getPublicSiteSettings())[key];
}

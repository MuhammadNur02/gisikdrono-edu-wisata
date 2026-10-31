import type { CatalogueSettingName, EditableSettingName } from '@/config/site-settings';
import type { CatalogueSettingsValues, SiteSettingsValues } from '@/lib/validations/settings';

// The site_settings keys docs/PRD.md §8.6 marks public. A contact value still holding its seeded placeholder
// reads as null, so the site never shows a sample address or number.
export interface PublicSiteSettings {
  bookingEnabled: boolean;
  maintenanceMode: boolean;
  minLeadHours: number;
  maxAdvanceDays: number;
  maxPax: number;
  contactWhatsappNumber: string | null;
  contactEmail: string | null;
  kelurahanAddress: string | null;
  // Where UMKM products are ordered, picked up and paid for (decision of 2026-10-29): the Koperasi Merah Putih.
  kopdesWhatsappNumber: string | null;
  kopdesAddress: string | null;
  // Whether UMKM product prices show on the public site (decision of 2026-10-30, catalogue.show_product_prices).
  showProductPrices: boolean;
  seoDefaultDescription: string;
  // The Pejabat Pelindungan Data named on /privasi (docs/Security.md §7.6).
  dpoName: string | null;
  dpoEmail: string | null;
}

// /dashboard/settings (Task P4.9.01): the form's values, booking_enabled beside them (read-only until Task P3.12), and
// the fields still holding a seeded placeholder.
export interface SiteSettingsAdmin {
  values: SiteSettingsValues;
  bookingEnabled: boolean;
  placeholders: EditableSettingName[];
}

// Pengaturan Katalog, the Kopdes admin's settings page (docs/PRD.md §13.1 A30): the catalogue keys alone.
export interface CatalogueSettingsAdmin {
  values: CatalogueSettingsValues;
  placeholders: CatalogueSettingName[];
}

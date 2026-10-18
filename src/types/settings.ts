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
  seoDefaultDescription: string;
  // The Pejabat Pelindungan Data named on /privasi (docs/Security.md §7.6).
  dpoName: string | null;
  dpoEmail: string | null;
}

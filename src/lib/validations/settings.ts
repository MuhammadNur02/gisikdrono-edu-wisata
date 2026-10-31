import { z } from 'zod';

import { RATE_LIMIT_PROFILES, SETTING_LIMITS as LIMITS } from '@/config/site-settings';
import { cmsCopy } from '@/lib/copy/cms';
import { settingsCopy } from '@/lib/copy/settings';
import { contentText } from '@/lib/validations/content';

// /dashboard/settings (Task P4.9.01, docs/PRD.md §8.6): every key the superadmin edits, typed as the database's
// functions read it. Shared by the form and updateSiteSettingsAction; .strict(), so booking_enabled (read-only until
// P3.12) or any other key cannot ride along.

const messages = cmsCopy.validation;
const PHONE_PATTERN = /^\+62[0-9]{8,13}$/;
// `BCA ****1234`: the bank and the last four digits only, never a whole account number (docs/PRD.md §8.6).
const HOURS_PER_DAY = 24;
const MASKED_ACCOUNT_PATTERN = /^[A-Za-z][A-Za-z ]{1,28} \*{4}\d{4}$/;

function wholeNumber(min: number, max: number) {
  return z
    .number({ error: settingsCopy.invalid.number })
    .int(settingsCopy.invalid.number)
    .min(min, settingsCopy.invalid.range(min, max))
    .max(max, settingsCopy.invalid.range(min, max));
}

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(LIMITS.email, messages.email)
  .pipe(z.email(messages.email));

// docs/PRD.md §13.1 A30: the three keys the Kopdes admin edits too, the same fields in both forms.
const catalogueSettingFields = {
  kopdesWhatsappNumber: z.string().trim().regex(PHONE_PATTERN, messages.phone),
  kopdesAddress: contentText(LIMITS.address),
  showProductPrices: z.boolean(),
};

export const siteSettingsSchema = z
  .object({
    whatsappEnabled: z.boolean(),
    emailEnabled: z.boolean(),
    maintenanceMode: z.boolean(),
    rateLimitProfile: z.enum(RATE_LIMIT_PROFILES),
    graceBeforeMinutes: wholeNumber(0, LIMITS.graceMinutesMax),
    graceAfterMinutes: wholeNumber(0, LIMITS.graceMinutesMax),
    holdMinutesIndividual: wholeNumber(LIMITS.holdMinutesMin, LIMITS.holdMinutesMax),
    holdHoursInstitution: wholeNumber(LIMITS.holdHoursMin, LIMITS.holdHoursMax),
    quotationValidDays: wholeNumber(LIMITS.quotationDaysMin, LIMITS.quotationDaysMax),
    minLeadHours: wholeNumber(0, LIMITS.leadHoursMax),
    maxAdvanceDays: wholeNumber(LIMITS.advanceDaysMin, LIMITS.advanceDaysMax),
    maxPax: wholeNumber(LIMITS.maxPaxMin, LIMITS.maxPaxMax),
    minPricePerPax: wholeNumber(LIMITS.minPricePerPaxMin, LIMITS.minPricePerPaxMax),
    piiRetentionMonths: wholeNumber(LIMITS.retentionMonthsMin, LIMITS.retentionMonthsMax),
    expectedPayoutAccountMasked: z
      .string()
      .trim()
      .max(LIMITS.payoutAccount, settingsCopy.invalid.payoutAccount)
      .regex(MASKED_ACCOUNT_PATTERN, settingsCopy.invalid.payoutAccount),
    contactWhatsappNumber: z.string().trim().regex(PHONE_PATTERN, messages.phone),
    contactEmail: emailSchema,
    kelurahanAddress: contentText(LIMITS.address),
    ...catalogueSettingFields,
    dpoName: contentText(LIMITS.shortText),
    dpoEmail: emailSchema,
    signatoryName: contentText(LIMITS.shortText),
    signatoryTitle: contentText(LIMITS.shortText),
    certificateTemplateVersion: wholeNumber(LIMITS.templateVersionMin, LIMITS.templateVersionMax),
    seoDefaultDescription: contentText(LIMITS.seoDescription),
  })
  .strict()
  .superRefine((settings, context) => {
    // The wizard offers dates from now + minLeadHours to now + maxAdvanceDays, so the first must come first.
    if (settings.minLeadHours >= settings.maxAdvanceDays * HOURS_PER_DAY) {
      context.addIssue({
        code: 'custom',
        path: ['minLeadHours'],
        message: settingsCopy.invalid.leadBeforeAdvance,
      });
    }
  });

export type SiteSettingsInput = z.input<typeof siteSettingsSchema>;
export type SiteSettingsValues = z.output<typeof siteSettingsSchema>;

// /dashboard/settings for the Kopdes admin (Pengaturan Katalog): the catalogue keys alone, which the superadmin edits in
// the whole form above. Shared by its form and updateCatalogueSettingsAction; .strict(), so no other key rides along.
export const catalogueSettingsSchema = z.object(catalogueSettingFields).strict();

export type CatalogueSettingsInput = z.input<typeof catalogueSettingsSchema>;
export type CatalogueSettingsValues = z.output<typeof catalogueSettingsSchema>;

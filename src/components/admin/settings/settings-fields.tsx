'use client';

import type { Control } from 'react-hook-form';

import {
  CheckboxField,
  NumberInputField,
  SelectField,
  TextField,
} from '@/components/admin/cms/fields';
import { FormSection } from '@/components/admin/cms/form-section';
import { MoneyField } from '@/components/admin/cms/money-field';
import { Badge } from '@/components/ui/badge';
import {
  RATE_LIMIT_PROFILES,
  SETTING_LIMITS as LIMITS,
  type EditableSettingName,
} from '@/config/site-settings';
import { settingsCopy } from '@/lib/copy/settings';
import type { SiteSettingsInput } from '@/lib/validations/settings';

// The groups of the settings form (Task P4.9.01): each field labelled from src/lib/copy/settings.ts and, while it still
// holds a seeded placeholder, marked so.

const text = settingsCopy;
const fields = text.fields;
const PROFILE_OPTIONS = RATE_LIMIT_PROFILES.map((profile) => ({
  value: profile,
  label: text.rateLimitProfiles[profile],
}));

// The fields the form holds as whole numbers (minutes, hours, days, counts, a version).
type NumberSettingName = {
  [Name in EditableSettingName]: SiteSettingsInput[Name] extends number ? Name : never;
}[EditableSettingName];

// The fields the form holds as text (contacts, names, the masked account, the description).
type TextSettingName = {
  [Name in EditableSettingName]: SiteSettingsInput[Name] extends string ? Name : never;
}[EditableSettingName];

export interface SettingsGroupProps {
  control: Control<SiteSettingsInput>;
  // The fields still holding a seeded placeholder.
  placeholders: readonly EditableSettingName[];
}

function describe(name: EditableSettingName, placeholders: readonly EditableSettingName[]) {
  const field: { label: string; description?: string } = fields[name];
  if (!placeholders.includes(name)) return field;
  return {
    label: field.label,
    description: [text.placeholder, field.description].filter(Boolean).join('. '),
  };
}

function NumberSetting({
  control,
  placeholders,
  name,
}: SettingsGroupProps & { name: NumberSettingName }) {
  return (
    <NumberInputField control={control} name={name} required {...describe(name, placeholders)} />
  );
}

function TextSetting({
  control,
  placeholders,
  name,
  ...input
}: SettingsGroupProps & {
  name: TextSettingName;
  maxLength: number;
  type?: 'email';
  multiline?: boolean;
}) {
  return (
    <TextField
      control={control}
      name={name}
      required
      {...input}
      {...describe(name, placeholders)}
    />
  );
}

// booking_enabled is shown, never switched, until Task P3.12 opens the guest pages.
export function BookingEnabledNotice({ isOpen }: { isOpen: boolean }) {
  return (
    <div className="space-y-1 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-body-sm font-medium">{text.bookingEnabled.label}</span>
        <Badge variant={isOpen ? 'success' : 'neutral'}>
          {isOpen ? text.bookingEnabled.open : text.bookingEnabled.closed}
        </Badge>
      </div>
      <p className="text-caption text-muted-foreground">{text.bookingEnabled.note}</p>
    </div>
  );
}

export function BookingSettings(props: SettingsGroupProps & { bookingEnabled: boolean }) {
  return (
    <FormSection title={text.groups.booking}>
      <BookingEnabledNotice isOpen={props.bookingEnabled} />
      <CheckboxField control={props.control} name="maintenanceMode" {...fields.maintenanceMode} />
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberSetting {...props} name="minLeadHours" />
        <NumberSetting {...props} name="maxAdvanceDays" />
        <NumberSetting {...props} name="maxPax" />
        <NumberSetting {...props} name="quotationValidDays" />
        <NumberSetting {...props} name="holdMinutesIndividual" />
        <NumberSetting {...props} name="holdHoursInstitution" />
      </div>
    </FormSection>
  );
}

export function ChannelSettings({ control }: SettingsGroupProps) {
  return (
    <FormSection title={text.groups.channels}>
      <CheckboxField control={control} name="whatsappEnabled" {...fields.whatsappEnabled} />
      <CheckboxField control={control} name="emailEnabled" {...fields.emailEnabled} />
      <SelectField
        control={control}
        name="rateLimitProfile"
        options={PROFILE_OPTIONS}
        required
        {...fields.rateLimitProfile}
      />
    </FormSection>
  );
}

export function CheckinSettings(props: SettingsGroupProps) {
  return (
    <FormSection title={text.groups.checkin}>
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberSetting {...props} name="graceBeforeMinutes" />
        <NumberSetting {...props} name="graceAfterMinutes" />
      </div>
    </FormSection>
  );
}

export function FinanceSettings(props: SettingsGroupProps) {
  return (
    <FormSection title={text.groups.finance}>
      <MoneyField
        control={props.control}
        name="minPricePerPax"
        required
        {...fields.minPricePerPax}
      />
      <NumberSetting {...props} name="piiRetentionMonths" />
      <TextSetting {...props} name="expectedPayoutAccountMasked" maxLength={LIMITS.payoutAccount} />
    </FormSection>
  );
}

export function ContactSettings(props: SettingsGroupProps) {
  return (
    <FormSection title={text.groups.contact}>
      <TextSetting {...props} name="contactWhatsappNumber" maxLength={LIMITS.shortText} />
      <TextSetting {...props} name="contactEmail" maxLength={LIMITS.email} type="email" />
      <TextSetting {...props} name="kelurahanAddress" maxLength={LIMITS.address} multiline />
      <TextSetting {...props} name="kopdesWhatsappNumber" maxLength={LIMITS.shortText} />
      <TextSetting {...props} name="kopdesAddress" maxLength={LIMITS.address} multiline />
      <TextSetting {...props} name="dpoName" maxLength={LIMITS.shortText} />
      <TextSetting {...props} name="dpoEmail" maxLength={LIMITS.email} type="email" />
    </FormSection>
  );
}

// Decision of 2026-10-30: the UMKM product prices stay off the public site until the owner knows them.
export function CatalogueSettings({ control }: SettingsGroupProps) {
  return (
    <FormSection title={text.groups.catalogue}>
      <CheckboxField control={control} name="showProductPrices" {...fields.showProductPrices} />
    </FormSection>
  );
}

export function DocumentSettings(props: SettingsGroupProps) {
  return (
    <FormSection title={text.groups.documents}>
      <TextSetting {...props} name="signatoryName" maxLength={LIMITS.shortText} />
      <TextSetting {...props} name="signatoryTitle" maxLength={LIMITS.shortText} />
      <NumberSetting {...props} name="certificateTemplateVersion" />
      <TextSetting
        {...props}
        name="seoDefaultDescription"
        maxLength={LIMITS.seoDescription}
        multiline
      />
    </FormSection>
  );
}

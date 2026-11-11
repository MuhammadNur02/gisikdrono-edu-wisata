import { z } from 'zod';

import { totpCodeField } from '@/lib/validations/auth';

// Task P4.7.06: closing a weather link the sweep holds without a refund. The reason has the length
// public.resolve_weather_link checks (20261104181000).
export const WEATHER_LINK_REASON_MIN_LENGTH = 10;
export const WEATHER_LINK_REASON_MAX_LENGTH = 300;

const resolveFields = {
  linkId: z.uuid(),
  reason: z.string().trim().min(WEATHER_LINK_REASON_MIN_LENGTH).max(WEATHER_LINK_REASON_MAX_LENGTH),
};

export const resolveWeatherLinkSchema = z.object(resolveFields).strict();
export const resolveWeatherLinkFormSchema = z
  .object({ ...resolveFields, code: totpCodeField })
  .strict();
export type ResolveWeatherLinkValues = z.output<typeof resolveWeatherLinkSchema>;

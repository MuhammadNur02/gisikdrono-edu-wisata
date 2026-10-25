import 'server-only';

import type { DatabaseClient } from '@/db/rpc-result';
import { sessionStartsAt, toVisitDate } from '@/lib/utils/dates';
import type { WeatherLeg, WeatherOption, WeatherState } from '@/types/booking-hub';

// The weather part of the status hub (docs/PRD.md §13.1 A17, decision of 2026-10-25 on the weather), on the
// service-role client booking-service.ts hands in, keyed by the booking id a verified guest link gave. A booking's
// rights are its weather_notice_bookings rows still open: each names the one leg the weather stopped, the window and
// the moves used, and a move keeps them open.

const WEATHER_SETTING_KEYS = ['booking.weather_reschedule_max', 'booking.min_lead_hours'] as const;
const HOUR_MS = 3_600_000;
// How far ahead the hub offers a new day: the booking window's own limit is checked again by the database.
const WEATHER_OPTION_DAYS = 60;
const HOURS_PER_DAY = 24;
const DAY_MS = HOURS_PER_DAY * HOUR_MS;

async function weatherRulesOf(adminClient: DatabaseClient) {
  const { data, error } = await adminClient
    .from('site_settings')
    .select('key, value')
    .in('key', WEATHER_SETTING_KEYS);
  if (error) throw error;
  const numberOf = (key: string) => {
    const value = data.find((row) => row.key === key)?.value;
    return typeof value === 'number' ? value : 0;
  };
  return {
    maxMoves: numberOf('booking.weather_reschedule_max'),
    leadHours: numberOf('booking.min_lead_hours'),
  };
}

async function legsOf(adminClient: DatabaseClient, bookingId: string) {
  const { data, error } = await adminClient
    .from('booking_legs')
    .select('id, leg_order, rw_id, pax_count, visit_session_id, rw_units(name)')
    .eq('booking_id', bookingId)
    .order('leg_order');
  if (error) throw error;
  return data;
}

async function openLinksOf(adminClient: DatabaseClient, bookingId: string, now: Date) {
  const { data, error } = await adminClient
    .from('weather_notice_bookings')
    .select('booking_leg_id, open_until, moves_used, weather_notices(reason)')
    .eq('booking_id', bookingId)
    .is('resolved_at', null)
    .gt('open_until', now.toISOString())
    .order('open_until');
  if (error) throw error;
  return data;
}

// The open sessions of one RW a leg may move to: no sooner than `earliest` (booking.min_lead_hours ahead, as
// internal.reschedule_for_weather checks), not the one it is on, with room for the group.
async function sessionOptionsOf(
  adminClient: DatabaseClient,
  leg: { rw_id: number; pax_count: number; visit_session_id: string },
  earliest: Date,
): Promise<WeatherOption[]> {
  const { data, error } = await adminClient
    .from('v_session_availability')
    .select('id, session_date, start_time, end_time, label, remaining')
    .eq('rw_id', leg.rw_id)
    .gte('session_date', toVisitDate(earliest))
    .lte('session_date', toVisitDate(new Date(earliest.getTime() + WEATHER_OPTION_DAYS * DAY_MS)))
    .gte('remaining', leg.pax_count)
    .neq('id', leg.visit_session_id)
    .order('session_date')
    .order('start_time');
  if (error) throw error;
  return data
    .flatMap((row) =>
      row.id && row.session_date && row.start_time && row.end_time && row.remaining !== null
        ? [
            {
              sessionId: row.id,
              sessionDate: row.session_date,
              startTime: row.start_time,
              endTime: row.end_time,
              label: row.label,
              remaining: row.remaining,
            },
          ]
        : [],
    )
    .filter((option) => sessionStartsAt(option.sessionDate, option.startTime) > earliest);
}

// A booking's weather state, or null when no notice is open for it: for each stopped leg, when its window closes, the
// moves left and the sessions it may move to.
export async function weatherStateOf(
  adminClient: DatabaseClient,
  bookingId: string,
  now: Date = new Date(),
): Promise<WeatherState | null> {
  const links = await openLinksOf(adminClient, bookingId, now);
  const [first] = links;
  if (!first) return null;
  const [legs, rules] = await Promise.all([
    legsOf(adminClient, bookingId),
    weatherRulesOf(adminClient),
  ]);
  const earliest = new Date(now.getTime() + rules.leadHours * HOUR_MS);
  const stopped = await Promise.all(
    links.flatMap((link) => {
      const leg = legs.find((each) => each.id === link.booking_leg_id);
      if (!leg) return [];
      return [
        sessionOptionsOf(adminClient, leg, earliest).then((options): WeatherLeg => ({
          rwName: leg.rw_units.name,
          openUntil: link.open_until,
          movesLeft: Math.max(rules.maxMoves - link.moves_used, 0),
          options,
        })),
      ];
    }),
  );
  return { openUntil: first.open_until, reason: first.weather_notices.reason, legs: stopped };
}

// The RW and day of each session a booking's legs hold, for the session tags an action revalidates (CLAUDE.md §5.5).
export async function sessionDaysOf(
  adminClient: DatabaseClient,
  bookingId: string,
): Promise<{ rwId: number; sessionDate: string }[]> {
  const legs = await legsOf(adminClient, bookingId);
  const { data, error } = await adminClient
    .from('visit_sessions')
    .select('rw_id, session_date')
    .in(
      'id',
      legs.map((leg) => leg.visit_session_id),
    );
  if (error) throw error;
  return data.map((row) => ({ rwId: row.rw_id, sessionDate: row.session_date }));
}

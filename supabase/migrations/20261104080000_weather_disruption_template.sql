-- weather_disruption (decision of 2026-10-25 on the weather, rule 4): the message every paid booking on a session gets
-- when an RW officer or the superadmin says the weather stopped it: the RW, the day, the 24 h to choose, and that the
-- manage link comes in a message of its own. WhatsApp sends it as gsk_weather_disruption_v1 once Meta approves it
-- (docs/notifications.md); email until then.
-- A value added to an enum cannot be used in the transaction that adds it, so it has a migration of its own.
alter type public.notification_template add value 'weather_disruption';

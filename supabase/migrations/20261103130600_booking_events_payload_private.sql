-- Review of PR #76 (STAFF-02 class): booking_events.payload carries a step's own figures, such as a refund's or a
-- write-off's amount, and 0005 granted it to authenticated with the rest of the timeline. An RW admin could read a
-- combo's other RW's money through PostgREST that way, so the column is withdrawn. The dashboard's timeline reads the
-- status change, the actor, the reason and the time, none of which is money.

revoke select (payload) on public.booking_events from authenticated;

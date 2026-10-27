-- Task P4.3.10 (docs/PRD.md §13.1 A13, §8.4.4; BOOK-05, BOOK-11): an officer registers a group from abroad through
-- channel = 'admin' and may enter its PIC's number in E.164 with another country code, since that path has no OTP and
-- the officer checks the number with the group. A number with +62 is Indonesian on either path and keeps the
-- Indonesian rule; a web booking takes nothing else, and guest_otps.phone stays +62.

alter table public.bookings drop constraint bookings_pic_phone_check;
alter table public.bookings add constraint bookings_pic_phone_check check (
  pic_phone ~ '^\+62[0-9]{8,13}$'
  or (channel = 'admin' and pic_phone ~ '^\+[1-9][0-9]{7,14}$' and pic_phone !~ '^\+62')
);

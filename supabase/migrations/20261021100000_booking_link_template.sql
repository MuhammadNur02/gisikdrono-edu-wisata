-- booking_link: the message that carries a guest link again when a visitor asks for it at /reservasi/cari (docs/PRD.md
-- FR-BOOK-16, Task P3.3.03). No template of docs/PRD.md Appendix B carries just a link to the booking, so this adds
-- one; WhatsApp sends it as gsk_booking_link_v1 with a URL button, email as a plain link.
-- A value added to an enum cannot be used in the transaction that adds it, so it has a migration of its own.
alter type public.notification_template add value 'booking_link';

# WhatsApp templates for Meta approval

| Field | Value |
|---|---|
| Document | `docs/notifications.md` |
| Owner | Kelurahan Gisikdrono Edu Center project team |
| Started | 2026-10-21, with the first two templates the outbox sends (Task P3.2.03, P3.3.03) |
| Companion | `docs/Task.md` Appendix B (every template, its parameters and the task that enqueues it), `docs/PRD.md` Appendix B |

The Indonesian text of each WhatsApp template as it is submitted to Meta (Task P0.1.08), and where its approval stands. Language `id` for every template. Body parameters are numbered in the order of `src/lib/notifications/templates.ts`, which checks them before a message is queued or sent. Free-text parameters never carry a link, a host, an email address or a phone number; links travel only in URL buttons.

The email of each template says the same thing in plain text (`src/lib/notifications/message-text.ts`). On a local development server both channels are delivered to Mailpit instead (`docs/Security.md` §4.1 point 5).

Templates not listed here are added with the task that first sends them.

## Approval status

| Meta template | Category | Status | Notes |
|---|---|---|---|
| `gsk_otp_v1` | AUTHENTICATION | Not submitted | Waiting for the WhatsApp Business number (P0.1.07). The developer's test number is blocked, so `src/lib/notifications/whatsapp-meta.ts` has not yet reached a real phone (Task P3.11.03 note) |
| `gsk_booking_link_v1` | UTILITY | Not submitted | New template, decision of 2026-10-21 (Task P3.3.03) |

## `gsk_otp_v1` (`phone_otp`)

Meta writes the body of an AUTHENTICATION template itself; the submission chooses the options.

- Body: Meta's own Indonesian wording, expected to read like `*{{1}}* adalah kode verifikasi Anda. Demi keamanan, jangan bagikan kode ini.`; copy the exact text here from Meta's preview when submitting.
- Options: security recommendation on; code expiry 5 minutes ("Kode ini kedaluwarsa dalam 5 menit."), which matches `guest_otps.expires_at`.
- Button: copy code, label "Salin kode".
- Parameters: `{{1}}` code, six digits. The worker sends the code again as the button's parameter, as Meta requires for a copy-code button.

## `gsk_booking_link_v1` (`booking_link`)

Sent when a visitor asks for their booking link again at `/reservasi/cari`. It goes only to the booking's verified WhatsApp number, at most three times a day.

- Body:

  ```text
  Halo {{1}}, berikut tautan untuk membuka reservasi {{2}} di Edu Wisata Gisikdrono. Tautan berlaku 3 hari dan hanya untuk Anda, jadi jangan teruskan ke orang lain. Jika Anda tidak memintanya, abaikan pesan ini.
  ```

- Button: URL, label "Buka reservasi", address `https://<domain>/reservasi/{{1}}`. The dynamic part is `<booking_code>?t=<token>`, a `manage` link the worker mints when it sends the message.
- Parameters: `{{1}}` the PIC's first name, `{{2}}` the booking code (`GSK-7F3K9Q2M`).
- Sample values for review: `Ani`, `GSK-7F3K9Q2M`; button sample `GSK-7F3K9Q2M?t=contoh`.

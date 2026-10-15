// Synthetic, obviously fake values that satisfy src/lib/env.ts for a local sandbox deployment.
const fakeSecret = 'fixture-secret-'.padEnd(40, 'x');
const zeroKeyBase64 = Buffer.alloc(32).toString('base64');

export const sandboxEnv = {
  NEXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3000',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-anon-key',
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
  NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER: '+6281200000000',
  SUPABASE_SERVICE_ROLE_KEY: 'fixture-service-role-key',
  MIDTRANS_SERVER_KEY: 'SB-Mid-server-fixture',
  MIDTRANS_CLIENT_KEY: 'SB-Mid-client-fixture',
  MIDTRANS_IS_PRODUCTION: 'false',
  MIDTRANS_MERCHANT_ID: 'G000000000',
  MIDTRANS_WEBHOOK_PATH_TOKEN: fakeSecret,
  WHATSAPP_VERIFY_TOKEN: fakeSecret,
  RESEND_API_KEY: 'fixture-resend-key',
  EMAIL_FROM: 'Edu Wisata Gisikdrono <noreply@example.test>',
  QR_SIGNING_KEYS: JSON.stringify({ k1: zeroKeyBase64 }),
  QR_SIGNING_ACTIVE_KID: 'k1',
  BOOKING_LINK_SECRET: fakeSecret,
  OTP_PEPPER: fakeSecret,
  CRON_SECRET: fakeSecret,
  TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
  SECURITY_ALERT_EMAIL: 'keamanan@example.test',
  SECURITY_ALERT_WA_PHONE: '+6281200000001',
};

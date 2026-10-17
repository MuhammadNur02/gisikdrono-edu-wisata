// Routes that touch money, PII or a login. They are never cached or indexed, and their scripts run
// only with a per-request nonce. Public ISR pages are everything else (docs/Security.md §8.2).
export const PRIVATE_ROUTE_PREFIXES = [
  '/dashboard',
  '/pesan',
  '/reservasi',
  '/login',
  '/forgot-password',
  '/reset-password',
  '/mfa',
  '/onboarding',
  '/auth',
  '/v',
] as const;

// The WhatsApp button stays off checkout and the dashboard (docs/StyleGuide.md §5.16): a booking in progress
// has its own help, and staff have no use for the visitor chat.
export const WHATSAPP_FAB_HIDDEN_PREFIXES = ['/pesan', '/reservasi', '/dashboard'] as const;

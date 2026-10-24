import { z } from 'zod';

import { simulatedNotification } from '../../../scripts/midtrans-notification';
import { sandboxEnv } from '../../fixtures/env';

// The Midtrans stand-in of the e2e run (decision of 2026-10-24, Q3): Playwright's global setup starts it on this port,
// and the CI e2e job builds and serves the app with MIDTRANS_LOCAL_STUB_URL pointing here. The notification is signed
// with the sandbox fixture keys CI serves the app with (tests/fixtures/env.ts).
export const E2E_MIDTRANS_STUB_PORT = 4010;
export const E2E_MIDTRANS_STUB_URL = `http://127.0.0.1:${String(E2E_MIDTRANS_STUB_PORT)}`;
const LOCAL_APP_URL = 'http://127.0.0.1:3000';

const stubOrderSchema = z.object({ grossAmount: z.string(), transactionId: z.string() });

// The visitor "pays": the stand-in answers the Status API with a settlement, and the webhook gets Midtrans' own
// notification for it.
export async function settleThroughWebhook(orderId: string): Promise<Response> {
  const orderUrl = `${E2E_MIDTRANS_STUB_URL}/__stub/orders/${encodeURIComponent(orderId)}`;
  const order = stubOrderSchema.parse(
    await (
      await fetch(orderUrl, {
        method: 'POST',
        body: JSON.stringify({ transactionStatus: 'settlement' }),
      })
    ).json(),
  );
  const notification = simulatedNotification({
    orderId,
    status: 'settlement',
    grossAmount: order.grossAmount,
    transactionId: order.transactionId,
    serverKey: sandboxEnv.MIDTRANS_SERVER_KEY,
    merchantId: sandboxEnv.MIDTRANS_MERCHANT_ID,
  });
  return fetch(`${LOCAL_APP_URL}/api/webhooks/midtrans/${sandboxEnv.MIDTRANS_WEBHOOK_PATH_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(notification),
  });
}

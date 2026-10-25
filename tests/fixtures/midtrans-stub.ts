import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { midtransTime } from '../../scripts/midtrans-notification';

// A stand-in for Midtrans on this machine (decision of 2026-10-24, Q3): the integration and e2e runs point
// MIDTRANS_LOCAL_STUB_URL here, since their sandbox keys are fake and a simulated settlement must pass the Status API
// re-check. It serves what src/lib/midtrans/client.ts calls (Snap's transactions, an order's status, its expiry) and a
// /__stub/orders control path the tests and pnpm midtrans:simulate use to say how an order now stands. It keeps
// everything in memory and checks only that a server key was sent.

export interface StubOrder {
  orderId: string;
  grossAmount: string;
  transactionId: string;
  // Unset until the visitor "pays": Midtrans has no transaction for a Snap page nobody chose a method on.
  transactionStatus?: string;
  fraudStatus?: string;
  paymentType?: string;
}

export interface MidtransStub {
  url: string;
  orders: Map<string, StubOrder>;
  close: () => Promise<void>;
}

const UNKNOWN_ORDER = { status_code: '404', status_message: "Transaction doesn't exist." };
const STATUS_CODES: Record<string, string> = {
  settlement: '200',
  capture: '200',
  pending: '201',
  deny: '202',
  cancel: '200',
  expire: '407',
  refund: '200',
  partial_refund: '200',
};

function send(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk as Uint8Array));
  const text = Buffer.concat(chunks).toString('utf8');
  return text === '' ? {} : (JSON.parse(text) as Record<string, unknown>);
}

export function statusBodyOf(order: StubOrder): Record<string, unknown> {
  const status = order.transactionStatus ?? 'pending';
  return {
    status_code: STATUS_CODES[status] ?? '200',
    status_message: 'Success, transaction is found',
    order_id: order.orderId,
    transaction_id: order.transactionId,
    transaction_status: status,
    fraud_status: order.fraudStatus ?? 'accept',
    gross_amount: order.grossAmount,
    currency: 'IDR',
    payment_type: order.paymentType ?? 'bank_transfer',
    va_numbers: [{ bank: 'bca', va_number: '12345678901' }],
    transaction_time: midtransTime(),
    ...(status === 'settlement' ? { settlement_time: midtransTime() } : {}),
  };
}

function createSnapPage(
  base: string,
  orders: Map<string, StubOrder>,
  body: Record<string, unknown>,
) {
  const details = body.transaction_details as { order_id: string; gross_amount: number };
  if (orders.has(details.order_id)) {
    return {
      status: 400,
      body: { error_messages: ['transaction_details.order_id sudah digunakan'] },
    };
  }
  orders.set(details.order_id, {
    orderId: details.order_id,
    grossAmount: `${String(details.gross_amount)}.00`,
    transactionId: randomUUID(),
  });
  const token = randomUUID();
  return { status: 201, body: { token, redirect_url: `${base}/snap/v4/redirection/${token}` } };
}

function expireOrder(order: StubOrder | undefined) {
  if (!order?.transactionStatus) return { status: 404, body: UNKNOWN_ORDER };
  if (order.transactionStatus !== 'pending') {
    return {
      status: 412,
      body: { status_code: '412', status_message: 'Merchant cannot modify the status' },
    };
  }
  order.transactionStatus = 'expire';
  return { status: 407, body: statusBodyOf(order) };
}

type StubAnswer = { status: number; body: unknown };

const CONTROL_PATH = /^\/__stub\/orders\/([^/]+)$/;
const CORE_API_PATH = /^\/v2\/([^/]+)\/(status|expire)$/;

// The tests' own path: how an order stands, and a change to it.
async function answerControl(
  request: IncomingMessage,
  order: StubOrder | undefined,
): Promise<StubAnswer> {
  if (!order) return { status: 404, body: UNKNOWN_ORDER };
  if (request.method === 'POST') Object.assign(order, await readBody(request));
  return { status: 200, body: order };
}

function answerCoreApi(action: string | undefined, order: StubOrder | undefined): StubAnswer {
  if (action === 'expire') return expireOrder(order);
  return order?.transactionStatus
    ? { status: 200, body: statusBodyOf(order) }
    : { status: 404, body: UNKNOWN_ORDER };
}

async function answer(
  request: IncomingMessage,
  base: string,
  orders: Map<string, StubOrder>,
): Promise<StubAnswer> {
  const path = new URL(request.url ?? '/', base).pathname;
  if (path.startsWith('/snap/v4/redirection/')) return { status: 200, body: { page: 'stub' } };
  const control = CONTROL_PATH.exec(path);
  if (control) return answerControl(request, orders.get(decodeURIComponent(control[1] ?? '')));
  return answerMerchantApi(request, path, base, orders);
}

// What src/lib/midtrans/client.ts calls, behind a server key as at Midtrans.
async function answerMerchantApi(
  request: IncomingMessage,
  path: string,
  base: string,
  orders: Map<string, StubOrder>,
): Promise<StubAnswer> {
  if (!request.headers.authorization?.startsWith('Basic ')) {
    return { status: 401, body: { status_code: '401', status_message: 'Unknown server key' } };
  }
  if (request.method === 'POST' && path === '/snap/v1/transactions') {
    return createSnapPage(base, orders, await readBody(request));
  }
  const coreApi = CORE_API_PATH.exec(path);
  return coreApi
    ? answerCoreApi(coreApi[2], orders.get(decodeURIComponent(coreApi[1] ?? '')))
    : { status: 404, body: UNKNOWN_ORDER };
}

export async function startMidtransStub(port = 0): Promise<MidtransStub> {
  const orders = new Map<string, StubOrder>();
  let base = '';
  const server = createServer((request, response) => {
    answer(request, base, orders).then(
      ({ status, body }) => {
        send(response, status, body);
      },
      () => {
        send(response, 500, { status_code: '500' });
      },
    );
  });
  // A port already taken (another run's stand-in) fails here instead of leaving the caller waiting.
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  return {
    url: base,
    orders,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}

import { config } from 'zod/v4/core';

// docs/Security.md §8.2: zod 4 probes `new Function('')` when it builds an object schema, to see whether it may
// compile a fast parser. The nonce CSP refuses eval, so the probe threw quietly but still reported a script-src
// violation on every page with a form (Task P5.4.01). jitless skips the probe and the compiled parser; the browser
// parses a few small form objects, so the interpreted path costs nothing noticeable. This file runs before any
// application module in the browser, so no schema is built before the flag is set; the server keeps the fast parser.
config({ jitless: true });

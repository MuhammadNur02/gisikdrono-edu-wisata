import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';

import { noLoggingWholeRecords } from './no-logging-whole-records.mjs';

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();
const wholeRecord = [{ messageId: 'wholeRecord' }];

ruleTester.run('no-logging-whole-records', noLoggingWholeRecords, {
  valid: [
    "logger.info('job_run', { bookingId: booking.id, code: booking.booking_code })",
    "log.error('internal_error', { booking: { id: booking.id } })",
    'console.info(booking)',
    'bookingService.info(booking)',
    "logger.info('job_run', { count: participants.length })",
  ],
  invalid: [
    { code: "logger.error('internal_error', booking)", errors: wholeRecord },
    { code: "logger.info('job_run', { booking })", errors: wholeRecord },
    { code: "log.warn('rate_limited', { booking: row })", errors: wholeRecord },
    { code: "logger.info('job_run', { ...bookingRow })", errors: wholeRecord },
    {
      code: "ctx.logger.error('internal_error', { rows: booking_participants })",
      errors: wholeRecord,
    },
    { code: "requestLogger.info('job_run', { participants })", errors: wholeRecord },
  ],
});

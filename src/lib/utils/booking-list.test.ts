import { describe, expect, it } from 'vitest';

import {
  activeBookingView,
  bookingViewHref,
  firstPageAddress,
  visitDateFilterOf,
} from '@/lib/utils/booking-list';

describe('visitDateFilterOf', () => {
  it('keeps a real calendar day and drops anything else', () => {
    expect(visitDateFilterOf('2026-11-06')).toBe('2026-11-06');
    expect(visitDateFilterOf('2026-02-30')).toBeNull();
    expect(visitDateFilterOf('6 November')).toBeNull();
    expect(visitDateFilterOf(null)).toBeNull();
  });
});

describe('firstPageAddress', () => {
  it('keeps every filter but the page', () => {
    expect(
      firstPageAddress('/dashboard/bookings', { page: '4', q: 'SD', status: ['paid', 'quoted'] }),
    ).toBe('/dashboard/bookings?q=SD&status=paid&status=quoted');
    expect(firstPageAddress('/dashboard/bookings', { page: '2', rw: undefined })).toBe(
      '/dashboard/bookings',
    );
  });
});

const TODAY = '2026-11-17';
const NONE = { status: [], category: null, date: null, q: '' };

describe('activeBookingView', () => {
  it('names the tab the filters are', () => {
    expect(activeBookingView(NONE, TODAY)).toBe('all');
    expect(activeBookingView({ ...NONE, category: 'under_review' }, TODAY)).toBe('under_review');
    expect(activeBookingView({ ...NONE, date: TODAY }, TODAY)).toBe('today');
    expect(activeBookingView({ ...NONE, status: ['paid'] }, TODAY)).toBe('paid');
  });

  it('names none when the filters are not one tab', () => {
    expect(activeBookingView({ ...NONE, status: ['paid', 'completed'] }, TODAY)).toBeNull();
    expect(activeBookingView({ ...NONE, status: ['expired'] }, TODAY)).toBeNull();
    expect(activeBookingView({ ...NONE, date: '2026-11-20' }, TODAY)).toBeNull();
    expect(activeBookingView({ ...NONE, q: 'GSK', status: ['paid'] }, TODAY)).toBeNull();
  });
});

describe('bookingViewHref', () => {
  it('builds each tab from scratch, keeping only the RW', () => {
    expect(bookingViewHref('all', TODAY, null)).toBe('/dashboard/bookings');
    expect(bookingViewHref('today', TODAY, 5)).toBe('/dashboard/bookings?rw=5&date=2026-11-17');
    expect(bookingViewHref('under_review', TODAY, null)).toBe(
      '/dashboard/bookings?category=under_review',
    );
    expect(bookingViewHref('pending_payment', TODAY, null)).toBe(
      '/dashboard/bookings?status=pending_payment',
    );
  });
});

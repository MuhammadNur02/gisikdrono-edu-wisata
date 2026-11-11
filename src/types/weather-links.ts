// Task P4.7.06: a weather link the sweep holds for the superadmin (20261104181000, held_at and held_reason).
export type WeatherHeldReason = 'fee_unset' | 'shares_short' | 'payment_refunded';

export interface HeldWeatherLinkRow {
  id: string;
  bookingCode: string;
  rwId: number;
  openUntil: string;
  heldAt: string;
  heldReason: WeatherHeldReason;
}

export interface HeldWeatherLinks {
  items: HeldWeatherLinkRow[];
  hasMore: boolean;
}

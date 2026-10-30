import type { ProductPrice } from '@/types/product';

// Decision of 2026-10-30 (docs/PRD.md §13.1 A29 decision 7): what the public site may say about a product's price. The
// public product reads call this before anything is cached or rendered, so while catalogue.show_product_prices is off
// the amount never leaves the server: not in the page, its RSC payload, the JSON-LD or the OG image. A product with
// no price (products_umkm.price NULL) reads as `unset`, never as 0.
export function productPriceOf(price: number | null, isShown: boolean): ProductPrice {
  if (!isShown) return { status: 'hidden' };
  return price === null ? { status: 'unset' } : { status: 'set', amount: price };
}

// The amount to state, only when the site shows one: JSON-LD offers and OG images name a real price or none.
export function shownPriceAmount(price: ProductPrice): number | null {
  return price.status === 'set' ? price.amount : null;
}

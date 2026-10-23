import { z } from 'zod';

import { PRODUCT_LIMITS, VENDOR_LIMITS } from '@/config/products';
import { DB_ENUMS } from '@/db/enums';
import { productsCopy } from '@/lib/copy/products';
import {
  contentText,
  imagePathSchema,
  optionalContentText,
  rowIdSchema,
  slugSchema,
  sortOrderSchema,
} from '@/lib/validations/content';

// /dashboard/products and its vendors sheet (Task P4.3.06, docs/PRD.md FR-ADMIN-06): one schema for each form and its
// Server Actions. The RW is never part of a form (it is the one the superadmin's RwSwitcher points at, and a vendor's
// products share its RW, products_umkm_vendor_rw_guard); money is integer rupiah (CLAUDE.md §7.1). The vendor's bank
// columns are granted to no API role and stay out of these schemas until their superadmin RPCs exist.

const messages = productsCopy;
const PHONE_PATTERN = /^\+62[0-9]{8,13}$/;

// pending_review is the articles' step; a product is a draft, on the site, or archived.
export const PRODUCT_STATUSES = ['draft', 'published', 'archived'] as const;

const quantitySchema = z.int().min(1).max(PRODUCT_LIMITS.orderQtyMax);

const productFields = {
  vendorId: rowIdSchema,
  name: contentText(PRODUCT_LIMITS.name),
  slug: slugSchema,
  category: z.enum(DB_ENUMS.product_category),
  descriptionMd: optionalContentText(PRODUCT_LIMITS.descriptionMd),
  price: z.int().min(0).max(PRODUCT_LIMITS.priceMax),
  unitLabel: contentText(PRODUCT_LIMITS.unitLabel),
  minOrderQty: quantitySchema,
  maxOrderQty: quantitySchema.nullable(),
  leadTimeDays: z.int().min(0).max(PRODUCT_LIMITS.leadTimeDaysMax),
  isAddonEligible: z.boolean(),
  isAvailable: z.boolean(),
  isFeatured: z.boolean(),
  imagePaths: z.array(imagePathSchema.unwrap()).max(PRODUCT_LIMITS.images),
  status: z.enum(PRODUCT_STATUSES),
  sortOrder: sortOrderSchema,
};

// products_umkm: max_order_qty >= min_order_qty.
function orderRange(product: { minOrderQty: number; maxOrderQty: number | null }): boolean {
  return product.maxOrderQty === null || product.maxOrderQty >= product.minOrderQty;
}

const orderRangeIssue = { path: ['maxOrderQty'], message: messages.validation.maxBelowMin };

export const createProductSchema = z
  .object(productFields)
  .strict()
  .refine(orderRange, orderRangeIssue);

export const updateProductSchema = z
  .object({ id: rowIdSchema, ...productFields })
  .strict()
  .refine(orderRange, orderRangeIssue);

export type ProductInput = z.input<typeof createProductSchema>;
export type ProductValues = z.output<typeof createProductSchema>;
export type UpdateProductValues = z.output<typeof updateProductSchema>;

const vendorFields = {
  name: contentText(VENDOR_LIMITS.name),
  slug: slugSchema,
  ownerName: optionalContentText(VENDOR_LIMITS.ownerName),
  phone: z
    .string()
    .trim()
    .nullable()
    .transform((value) => (value === null || value === '' ? null : value))
    .refine((value) => value === null || PHONE_PATTERN.test(value), messages.vendors.phone),
  descriptionMd: optionalContentText(VENDOR_LIMITS.descriptionMd),
  isActive: z.boolean(),
};

export const createVendorSchema = z.object(vendorFields).strict();
export const updateVendorSchema = z.object({ id: rowIdSchema, ...vendorFields }).strict();

export type VendorInput = z.input<typeof createVendorSchema>;
export type VendorValues = z.output<typeof createVendorSchema>;
export type UpdateVendorValues = z.output<typeof updateVendorSchema>;

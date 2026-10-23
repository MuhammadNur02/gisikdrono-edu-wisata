import { PRODUCT_DEFAULT_UNIT } from '@/config/products';
import { PRODUCT_STATUSES, type ProductInput, type VendorInput } from '@/lib/validations/product';
import type { ProductAdmin } from '@/types/product';
import type { VendorAdmin } from '@/types/vendor';

// What the product and vendor forms start from (Task P4.3.06): a stored row as its fields hold it, or a blank one.

export function blankProduct(vendorId: string): ProductInput {
  return {
    vendorId,
    name: '',
    slug: '',
    category: 'other',
    descriptionMd: '',
    price: 0,
    unitLabel: PRODUCT_DEFAULT_UNIT,
    minOrderQty: 1,
    maxOrderQty: null,
    leadTimeDays: 0,
    isAddonEligible: false,
    isAvailable: true,
    isFeatured: false,
    imagePaths: [],
    status: 'draft',
    sortOrder: 0,
  };
}

// A product still under review elsewhere reads as a draft here; the product form offers no review step.
function productStatusOf(status: ProductAdmin['status']): ProductInput['status'] {
  return PRODUCT_STATUSES.find((candidate) => candidate === status) ?? 'draft';
}

export function productValues(product: ProductAdmin): ProductInput {
  return {
    vendorId: product.vendorId,
    name: product.name,
    slug: product.slug,
    category: product.category,
    descriptionMd: product.descriptionMd ?? '',
    price: product.price,
    unitLabel: product.unitLabel,
    minOrderQty: product.minOrderQty,
    maxOrderQty: product.maxOrderQty,
    leadTimeDays: product.leadTimeDays,
    isAddonEligible: product.isAddonEligible,
    isAvailable: product.isAvailable,
    isFeatured: product.isFeatured,
    imagePaths: product.imagePaths,
    status: productStatusOf(product.status),
    sortOrder: product.sortOrder,
  };
}

export function blankVendor(): VendorInput {
  return { name: '', slug: '', ownerName: '', phone: '', descriptionMd: '', isActive: true };
}

export function vendorValues(vendor: VendorAdmin): VendorInput {
  return {
    name: vendor.name,
    slug: vendor.slug,
    ownerName: vendor.ownerName ?? '',
    phone: vendor.phone ?? '',
    descriptionMd: vendor.descriptionMd ?? '',
    isActive: vendor.isActive,
  };
}

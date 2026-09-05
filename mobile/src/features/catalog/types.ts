import type { components } from '@coffix/api-client';

export type ActivitySummary = components['schemas']['ActivitySummaryRead'];
export type Category = components['schemas']['CatalogCategoryRead'];
export type Product = components['schemas']['CatalogProductRead'];
export type ProductList = components['schemas']['CatalogProductListRead'];
export type ProductMedia = components['schemas']['CatalogProductMediaRead'];
export type Sku = components['schemas']['SkuRead'];

export type ProductListParams = {
  categoryId?: string;
  featured?: boolean;
  limit?: number;
  page?: number;
  query?: string;
};

export type CatalogImage = {
  alt: string;
  url: string;
};

const CATEGORY_PLACEHOLDER_URLS: Record<string, string> = {
  capsule: 'https://images.unsplash.com/photo-1610889556528-9a770e32642f?w=800&q=80',
  coffee: 'https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?w=800&q=80',
  'coffee-bean': 'https://images.unsplash.com/photo-1611854779393-1b2da9d400fe?w=800&q=80',
  settings: 'https://images.unsplash.com/photo-1516315720917-231ef9acce48?w=800&q=80',
  sparkles: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=800&q=80',
  wrench: 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=800&q=80',
};

const PRODUCT_PLACEHOLDER_URLS: Record<string, string> = {
  beans: CATEGORY_PLACEHOLDER_URLS['coffee-bean']!,
  capsule: CATEGORY_PLACEHOLDER_URLS.capsule!,
  coffee_machine: CATEGORY_PLACEHOLDER_URLS.coffee!,
  machine: CATEGORY_PLACEHOLDER_URLS.coffee!,
};

export function productTypeImage(
  productType: string,
  alt: string,
): CatalogImage | null {
  const url = PRODUCT_PLACEHOLDER_URLS[productType];
  return url ? { alt, url } : null;
}

// Curated per-model placeholder photos (no machine_model.image_url field
// exists on the backend today). Falls back to a generic machine photo for
// any model not listed here, so an unrecognized brand never renders blank.
const MACHINE_MODEL_IMAGE_URLS: Record<string, string> = {
  'lelit bianca v3': CATEGORY_PLACEHOLDER_URLS['coffee-bean']!,
  'rancilio silvia pro': CATEGORY_PLACEHOLDER_URLS.coffee!,
};

export function machineModelImage(
  manufacturer: string,
  modelName: string,
  alt: string,
): CatalogImage {
  const key = `${manufacturer} ${modelName}`.trim().toLowerCase();
  const url = MACHINE_MODEL_IMAGE_URLS[key] ?? PRODUCT_PLACEHOLDER_URLS.machine!;
  return { alt, url };
}

export function safeImageUrl(url: string): boolean {
  return /^https:\/\//.test(url) || /^http:\/\/(localhost|10\.0\.2\.2|127\.0\.0\.1)(:\d+)?\//.test(url);
}

export function categoryImage(category: Category): CatalogImage | null {
  if (category.image_url && safeImageUrl(category.image_url)) {
    return { alt: category.name_he, url: category.image_url };
  }
  const fallbackUrl = CATEGORY_PLACEHOLDER_URLS[category.icon_key ?? ''];
  return fallbackUrl ? { alt: category.name_he, url: fallbackUrl } : null;
}

export function firstSellableSku(product: Product): Sku | null {
  if (!product.is_active) {
    return null;
  }
  return product.skus.find(
    (sku) => sku.is_active && (sku.stock_quantity === null || sku.stock_quantity > 0),
  ) ?? null;
}

export function maximumQuantity(sku: Sku): number {
  return sku.stock_quantity === null ? 99 : Math.min(99, sku.stock_quantity);
}

export function productImage(
  product: Product,
  category?: Category,
): CatalogImage | null {
  const media = product.media.find((item) => safeImageUrl(item.url));
  if (media) {
    return { alt: media.alt_text_he, url: media.url };
  }
  if (category?.image_url && safeImageUrl(category.image_url)) {
    return { alt: category.name_he, url: category.image_url };
  }
  return productTypeImage(product.product_type, product.name_he);
}

export function formatIls(agorot: number): string {
  const whole = Math.floor(agorot / 100).toLocaleString('en-US');
  const remainder = Math.abs(agorot % 100);
  return remainder === 0
    ? `₪${whole}`
    : `₪${whole}.${remainder.toString().padStart(2, '0')}`;
}

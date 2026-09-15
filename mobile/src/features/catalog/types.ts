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

export function safeImageUrl(url: string): boolean {
  return /^https:\/\//.test(url) || /^http:\/\/(localhost|10\.0\.2\.2|127\.0\.0\.1)(:\d+)?\//.test(url);
}

export function categoryImage(category: Category): CatalogImage | null {
  if (category.image_url && safeImageUrl(category.image_url)) {
    return { alt: category.name_he, url: category.image_url };
  }
  return null;
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
  const media = product.media[0];
  if (media && safeImageUrl(media.url)) {
    return { alt: media.alt_text_he, url: media.url };
  }
  if (category?.image_url && safeImageUrl(category.image_url)) {
    return { alt: category.name_he, url: category.image_url };
  }
  return null;
}

export function formatIls(agorot: number): string {
  const whole = Math.floor(agorot / 100).toLocaleString('en-US');
  const remainder = Math.abs(agorot % 100);
  return remainder === 0
    ? `₪${whole}`
    : `₪${whole}.${remainder.toString().padStart(2, '0')}`;
}

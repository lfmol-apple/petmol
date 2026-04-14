import type { ProductCategory } from '@/lib/productScanner';

export type { ProductCategory };

export type ResolveSource =
  | 'cache'
  | 'cosmos'
  | 'openfoodfacts'
  | 'upcitemdb'
  | 'history';

// Full product representation produced by the resolver pipeline.
export interface ResolvedProduct {
  barcode: string;
  name: string;
  brand?: string;
  image?: string;
  category: ProductCategory;
  weight?: string;
  manufacturer?: string;
  concentration?: string;
  presentation?: string;
  source: ResolveSource;
}

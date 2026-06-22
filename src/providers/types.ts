import type { ProductVenue } from "../domain/types";

export type ProviderErrorCategory =
  | "network"
  | "http"
  | "anti_scraping"
  | "parse"
  | "missing_fields"
  | "stale_data"
  | "conflict";

export type ProviderFetchResult<T> =
  | {
      ok: true;
      data: T;
      source: string;
      dataDate: string;
      confidence: number;
      rawPayloadHash?: string;
      discoveryProfileGaps?: Array<{ targetCode: string; fundCode: string; venue: ProductVenue }>;
    }
  | {
      ok: false;
      errorCategory: ProviderErrorCategory;
      message: string;
      rawPayloadHash?: string;
    };

export interface DataProvider<T> {
  name: string;
  fetch: () => Promise<ProviderFetchResult<T>>;
}

export interface ProviderAttempt {
  providerName: string;
  ok: boolean;
  confidence?: number;
  fetchedAt?: string;
  errorCategory?: ProviderErrorCategory;
  message?: string;
  dataDate?: string;
  rawPayloadHash?: string;
}

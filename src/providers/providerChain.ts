import type { DataProvider, ProviderAttempt } from "./types";

export async function runProviderChain<T>(providers: DataProvider<T>[]): Promise<{
  data: T;
  providerResults: ProviderAttempt[];
  discoveryProfileGaps?: Array<{ targetCode: string; fundCode: string; venue: string }>;
}> {
  const providerResults: ProviderAttempt[] = [];

  for (const provider of providers) {
    const result = await provider.fetch();
    const fetchedAt = new Date().toISOString();
    if (result.ok) {
      providerResults.push({
        providerName: provider.name,
        ok: true,
        confidence: result.confidence,
        fetchedAt,
        dataDate: result.dataDate,
        rawPayloadHash: result.rawPayloadHash
      });
      return {
        data: result.data,
        providerResults,
        discoveryProfileGaps: result.discoveryProfileGaps
      };
    }

    providerResults.push({
      providerName: provider.name,
      ok: false,
      fetchedAt,
      errorCategory: result.errorCategory,
      message: result.message,
      rawPayloadHash: result.rawPayloadHash
    });
  }

  throw Object.assign(new Error("All providers failed"), { providerResults });
}

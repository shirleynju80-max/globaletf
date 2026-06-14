import type { DataProvider, ProviderAttempt } from "./types";

export async function runProviderChain<T>(providers: DataProvider<T>[]): Promise<{ data: T; providerResults: ProviderAttempt[] }> {
  const providerResults: ProviderAttempt[] = [];

  for (const provider of providers) {
    const result = await provider.fetch();
    if (result.ok) {
      providerResults.push({
        providerName: provider.name,
        ok: true,
        confidence: result.confidence,
        dataDate: result.dataDate,
        rawPayloadHash: result.rawPayloadHash
      });
      return { data: result.data, providerResults };
    }

    providerResults.push({
      providerName: provider.name,
      ok: false,
      errorCategory: result.errorCategory,
      message: result.message,
      rawPayloadHash: result.rawPayloadHash
    });
  }

  throw Object.assign(new Error("All providers failed"), { providerResults });
}

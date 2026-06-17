import { selectQdiiFundsForHoldingsScan } from "../domain/qdiiHoldingsUniverse";
import type { Fund } from "../domain/types";
import { fetchEastMoneyFundCodeRows } from "./eastmoneyFundSearch";

export interface LoadQdiiHoldingsCatalogOptions {
  fetchImpl?: typeof fetch;
}

/** Full East Money QDII catalog used only for F10 jjcc pulls (not all become product targets). */
export async function loadQdiiHoldingsCatalog(options: LoadQdiiHoldingsCatalogOptions = {}): Promise<Fund[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const rows = await fetchEastMoneyFundCodeRows(fetchImpl);
  return selectQdiiFundsForHoldingsScan(rows);
}

import type { ITokenStore } from "@repo/adapter-pns";
import type { DBClient, Retailer } from "@repo/db";

export class PNSDBTokenStore implements ITokenStore {
  constructor(private readonly db: DBClient) {}

  async get(
    retailer: Retailer,
    storeId: string
  ): Promise<{
    accessToken: string;
    refreshToken: string | null;
  } | null> {
    return await this.db.getCacheEntry<{
      accessToken: string;
      refreshToken: string | null;
    }>(`pns/${retailer}:${storeId}`);
  }

  async set(
    retailer: Retailer,
    storeId: string,
    params: {
      accessToken: string;
      refreshToken?: string | null;
    }
  ): Promise<void> {
    await this.db.setCacheEntry(`pns/${retailer}:${storeId}`, {
      accessToken: params.accessToken,
      refreshToken: params.refreshToken ?? null,
    });
  }

  async delete(retailer: Retailer, storeId: string): Promise<void> {
    await this.db.delCacheEntry(`pns/${retailer}:${storeId}`);
  }
}

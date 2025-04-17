import type { DBClient } from "@repo/db";

export type Retailer = "pns" | "nw";

export interface ITokenStore {
  get: (
    backend: Retailer,
    storeId: string
  ) => Promise<{
    accessToken: string;
    refreshToken?: string | null;
  } | null>;
  set: (
    backend: Retailer,
    storeId: string,
    params: {
      accessToken: string;
      refreshToken?: string | null;
    }
  ) => Promise<void>;
  delete: (backend: Retailer, storeId: string) => Promise<void>;
}

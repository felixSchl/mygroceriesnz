import type { PriceInfo, ProductInStoreData } from "../schema.js";
import { extractPricingInfoPNS } from "./pns.js";
import { extractPricingInfoWW } from "./ww.js";

export function extractPricingInfo(
  data: ProductInStoreData
): Omit<PriceInfo, "date" | "pisKeyId"> {
  switch (data.retailer) {
    case "ww":
      return extractPricingInfoWW(data);
    case "pns":
    case "nw":
      return extractPricingInfoPNS(data);
  }
}

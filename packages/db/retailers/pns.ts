import type { PNSProductData, PriceInfo, WWProductData } from "../schema.js";

export function extractPricingInfoPNS(
  data: PNSProductData
): Omit<PriceInfo, "date" | "pisKeyId"> {
  const bestPromo = data.promotions?.find((x) => x.bestPromotion);

  return {
    unitQty: data.singlePrice.comparativePrice?.unitQuantity ?? null,
    unitQtyUom: data.singlePrice.comparativePrice?.unitQuantityUom ?? null,
    unitDisplay: data.displayName ?? null,

    originalPrice: data.singlePrice.price,
    originalUnitPrice: data.singlePrice.comparativePrice?.pricePerUnit ?? null,

    // sale price
    salePrice:
      bestPromo?.rewardType === "NEW_PRICE" &&
      bestPromo.threshold <= 1 &&
      !bestPromo.cardDependencyFlag &&
      bestPromo.rewardValue !== data.singlePrice.price
        ? bestPromo.rewardValue
        : null,

    // club price
    clubPrice:
      bestPromo?.rewardType === "NEW_PRICE" &&
      bestPromo.threshold <= 1 &&
      bestPromo.cardDependencyFlag &&
      bestPromo.rewardValue !== data.singlePrice.price
        ? bestPromo.rewardValue
        : null,

    // multi buy
    multiBuyPrice:
      bestPromo?.rewardType === "NEW_PRICE" && bestPromo.threshold > 1
        ? bestPromo.rewardValue
        : null,
    multiBuyThreshold:
      bestPromo?.rewardType === "NEW_PRICE" && bestPromo.threshold > 1
        ? bestPromo.threshold
        : null,
  };
}

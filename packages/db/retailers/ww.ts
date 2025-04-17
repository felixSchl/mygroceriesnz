import type { PriceInfo, UOM, WWProductData, WWUOM } from "../schema.js";

// convert the dollar input into cents
function toNZDCents(dollars: number): number {
  return Math.round(dollars * 100);
}

const UOM_MAP: Record<WWUOM, [UOM, number]> = {
  "1m": ["m", 1],
  "100mm": ["m", 0.1], // TODO should we have a new 'mm' UOM instead?
  "1kg": ["kg", 1],
  "10g": ["g", 10],
  "100g": ["g", 100],
  "10mL": ["ml", 10],
  "100mL": ["ml", 100],
  "100ss": ["sheets", 100],
  "100ea": ["ea", 100],
  "1ea": ["ea", 1],
  "1L": ["l", 1],
};

export function extractPricingInfoWW(
  data: WWProductData
): Omit<PriceInfo, "date" | "pisKeyId"> {
  const uom = data.size?.cupMeasure ? UOM_MAP[data.size.cupMeasure] : null;

  return {
    unitQty: uom?.[1] ?? null,
    unitQtyUom: uom?.[0] ?? null,
    unitDisplay: data.unit ?? null,

    originalPrice: toNZDCents(data.price.originalPrice),
    originalUnitPrice: data.size?.cupListPrice
      ? toNZDCents(data.size.cupListPrice)
      : null,
    salePrice:
      data.price.isSpecial && !data.price.isClubPrice
        ? toNZDCents(data.price.salePrice)
        : null,
    clubPrice: data.price.isClubPrice ? toNZDCents(data.price.salePrice) : null,
    multiBuyPrice: data.productTag?.multiBuy
      ? toNZDCents(data.productTag.multiBuy.value)
      : null,
    multiBuyThreshold: data.productTag?.multiBuy
      ? data.productTag.multiBuy.quantity
      : null,
  };
}

import * as t from "@repo/io-ts";

export type Store = t.TypeOf<typeof StoreCodec>;
export const StoreCodec = t.strict(
  {
    id: t.string,
    name: t.string,
    banner: t.string,
    address: t.string,
    delivery: t.boolean,
    clickAndCollect: t.boolean,
    latitude: t.number,
    longitude: t.number,
    physicalStoreCode: t.string,
    region: t.string,
    salesOrgId: t.string,

    // TODO maybe load store working hours?
  },
  "Store"
);

export type ProductSearchResult = t.TypeOf<typeof ProductSearchResultCodec>;

const _UOM = t.union([
  t.literal("g"),
  t.literal("ea"),
  t.literal("m"),
  t.literal("kg"),
  t.literal("l"),
  t.literal("ml"),
  t.literal("sheets"),
]);

const UOMCodec = new t.Type<
  t.TypeOf<typeof _UOM> | null,
  string | null,
  unknown
>(
  "UOM",
  (v: unknown): v is t.TypeOf<typeof _UOM> | null => v == null || _UOM.is(v),
  (u, c) => {
    if (u === null) return t.success(null);
    if (typeof u !== "string") return t.failure(u, c, "UOM must be a string");
    u = u.toLowerCase().trim();
    if (u === "") return t.success(null);
    return _UOM.validate(u, c);
  },
  (v) => (v == null ? null : _UOM.encode(v))
);

export const ProductDataCodec = t.fixOptionals(
  t.strict(
    {
      brand: t.optional(t.string),
      productId: t.string,
      name: t.string,
      displayName: t.optional(t.string),
      availability: t.array(
        t.union([t.literal("IN_STORE"), t.literal("ONLINE")])
      ),
      saleType: t.union(
        [t.literal("UNITS"), t.literal("WEIGHT"), t.literal("BOTH")],
        "SaleType"
      ),
      singlePrice: t.strict(
        {
          price: t.number,
          promoId: t.optional(t.string),
          comparativePrice: t.optional(
            t.strict(
              {
                pricePerUnit: t.number,
                unitQuantity: t.number,
                unitQuantityUom: t.optional(UOMCodec),
              },
              "ComparativePrice"
            )
          ),
        },
        "SinglePrice"
      ),
      promotions: t.optional(
        t.array(
          t.strict(
            {
              rewardValue: t.number,
              rewardType: t.literal("NEW_PRICE"),
              threshold: t.number,
              multiProducts: t.boolean,
              cardDependencyFlag: t.boolean,
              bestPromotion: t.boolean,
            },
            "Promotion"
          )
        )
      ),
      variableWeight: t.optional(
        t.strict(
          {
            unitOfMeasure: t.optional(UOMCodec),
            averageWeight: t.optional(t.number),
            minOrderQuantity: t.optional(t.number),
            stepSize: t.optional(t.number),
            stepUnitOfMeasure: t.optional(UOMCodec),
          },
          "VariableWeight"
        )
      ),
      categoryTrees: t.optional(
        t.array(
          t.strict(
            {
              level0: t.optional(t.string),
              level1: t.optional(t.string),
              level2: t.optional(t.string),
            },
            "CategoryTree"
          )
        )
      ),
    },
    "PNSProductData"
  )
);

export const ProductSearchResultCodec = t.strict(
  {
    page: t.number,
    hitsPerPage: t.number,
    totalHits: t.number,
    totalPages: t.number,
    products: t.array(ProductDataCodec),
  },
  "ProductSearchResult"
);

export type ProductSearchResultList = t.TypeOf<typeof ProductSearchResultList>;
export const ProductSearchResultList = t.strict(
  {
    hits: t.array(ProductSearchResultCodec),
  },
  "ProductSearchResultList"
);

export type ProductDetailedInfo = t.TypeOf<typeof ProductDetailedInfo>;
export const ProductDetailedInfo = t.fixOptionals(
  t.type(
    {
      availability: t.optional(t.array(t.string)),
      originRegulated: t.optional(t.boolean),
      nonLoyaltyCardPrice: t.optional(t.number),
      // in cents
      price: t.number,
      comparativePricePerUnit: t.optional(t.number),
      comparativeUnitQuantity: t.optional(t.number),
      comparativeUnitQuantityUoM: t.optional(t.string),
      productId: t.string,
      description: t.optional(t.string),
      name: t.string,
      brand: t.optional(t.string),
      sku: t.string,
      unitOfMeasure: t.optional(t.string),
      saleType: t.optional(t.string),
      restrictedFlag: t.optional(t.boolean),
      netContentUOM: t.optional(t.string),
      displayName: t.optional(t.string),
      height: t.optional(t.number),
      width: t.optional(t.number),
      categories: t.optional(t.array(t.string)),
      categoryTrees: t.optional(t.any),
      fulfilmentOptions: t.optional(t.any),
      facets: t.optional(t.any),
      cateredFlag: t.optional(t.boolean),
      ingredientStatement: t.optional(t.string),
      nutritionalInfo: t.optional(
        t.type({
          noServesPerPack: t.optional(t.number),
          nutrients: t.optional(
            t.array(
              t.type({
                measurementPrecision: t.optional(t.string),
                nutrientBasisQty: t.optional(t.number),
                // example value GRM, need to know other units.
                nutrientBasisQtyUom: t.optional(t.string),
                nutrientType: t.optional(t.string),
                nutrientTypeDescription: t.optional(t.string),
                servingSizes: t.optional(
                  t.array(
                    t.type({
                      uomToValue: t.type({
                        uom: t.string,
                        value: t.number,
                      }),
                    })
                  )
                ),
                nutrientBasisQuantityType: t.optional(t.string),
                preparationState: t.optional(t.string),
                qtyContained: t.optional(t.number),
                nutrientUom: t.optional(t.string),
              })
            )
          ),
        })
      ),
    },
    "ProductDetailedInfo"
  )
);

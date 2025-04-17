import * as t from "@repo/io-ts";

const UnitCodec = t.union([t.literal("Each"), t.literal("Kg")]);

const UOMCodec = t.union([
  t.literal("1m"),
  t.literal("1kg"),
  t.literal("100g"),
  t.literal("10mL"),
  t.literal("100mm"),
  t.literal("100mL"),
  t.literal("100ss"),
  t.literal("100ea"),
  t.literal("10g"),
  t.literal("1ea"),
  t.literal("1L"),
]);

const AvailabilityStatusCodec = t.union([
  t.literal("In Stock"),
  t.literal("Out of Stock"),
  t.literal("Low Stock"),
]);

export const ProductCodec = t.strict(
  {
    type: t.literal("Product"),
    name: t.string,
    barcode: t.string,
    variety: t.optional(t.string),
    brand: t.string,
    slug: t.string,
    sku: t.string,
    unit: UnitCodec,
    price: t.strict(
      {
        originalPrice: t.number,
        salePrice: t.number,
        isClubPrice: t.boolean,
        isSpecial: t.boolean,
        isNew: t.boolean,
        discount: t.null,
        total: t.null,
        averagePricePerSingleUnit: t.optional(t.number),
        purchasingUnitPrice: t.null,
      },
      "Price"
    ),
    images: t.strict(
      {
        small: t.string,
        big: t.string,
      },
      "Images"
    ),
    // quantity: t.strict(
    //   {
    //     min: t.number,
    //     max: t.number,
    //     increment: t.number,
    //     value: t.null,
    //   },
    //   "Quantity"
    // ),
    stockLevel: t.optional(t.number),
    eachUnitQuantity: t.optional(t.null),
    averageWeightPerUnit: t.optional(t.number),
    size: t.optional(
      t.strict({
        cupListPrice: t.optional(t.number),
        cupPrice: t.optional(t.number),
        cupMeasure: t.optional(UOMCodec),
        packageType: t.optional(t.string),
        // volumeSize: "0.3-0.75kg 1pc",
      })
    ),
    productTag: t.optional(
      t.strict(
        {
          tagType: t.string,
          multiBuy: t.optional(
            t.strict(
              {
                quantity: t.number,
                value: t.number,
                link: t.string,
                multiCupValue: t.number,
              },
              "MultiBuy"
            )
          ),
          additionalTag: t.optional(
            t.strict(
              {
                name: t.string,
                link: t.optional(t.string),
              },
              "AdditionalTag"
            )
          ),
        },
        "ProductTag"
      )
    ),
    departments: t.array(
      t.strict({
        id: t.number,
        name: t.string,
      })
    ),
    supportsBothEachAndKgPricing: t.boolean,
    // brandSuggestionId: null,
    // brandSuggestionName: null,
    // priceUnitLabel: null,
    availabilityStatus: AvailabilityStatusCodec,
  },
  "Product"
);

export const ProductSearchResultCodec = t.strict({
  isSuccessful: t.literal(true),
  products: t.strict({
    items: t.array(
      t.union(
        [
          t.type({
            type: t.literal("PromoTile"),
          }),
          t.type({
            type: t.literal("PromotionalCarousel"),
          }),
          ProductCodec,
        ],
        "Item"
      ),
      "Products"
    ),
    totalItems: t.number,
  }),
  // dasFacets: [
  //   {
  //     key: "Shelf",
  //     value: "548",
  //     isBooleanValue: false,
  //     name: "Steak",
  //     productCount: 26,
  //     shelfResponses: null,
  //     group: "Shelf",
  //   },
  //   {
  //     key: "Shelf",
  //     value: "550",
  //     isBooleanValue: false,
  //     name: "Stew & Stir Fry",
  //     productCount: 16,
  //     shelfResponses: null,
  //     group: "Shelf",
  //   },
  //   {
  //     key: "Shelf",
  //     value: "552",
  //     isBooleanValue: false,
  //     name: "Ribs",
  //     productCount: 1,
  //     shelfResponses: null,
  //     group: "Shelf",
  //   },
  //   {
  //     key: "Shelf",
  //     value: "553",
  //     isBooleanValue: false,
  //     name: "Beef Schnitzel",
  //     productCount: 2,
  //     shelfResponses: null,
  //     group: "Shelf",
  //   },
  //   {
  //     key: "Shelf",
  //     value: "554",
  //     isBooleanValue: false,
  //     name: "BBQ Beef",
  //     productCount: 19,
  //     shelfResponses: null,
  //     group: "Shelf",
  //   },
  //   {
  //     key: "Shelf",
  //     value: "555",
  //     isBooleanValue: false,
  //     name: "Beef Mince & Patties",
  //     productCount: 38,
  //     shelfResponses: null,
  //     group: "Shelf",
  //   },
  //   {
  //     key: "Shelf",
  //     value: "556",
  //     isBooleanValue: false,
  //     name: "Beef Sausages",
  //     productCount: 10,
  //     shelfResponses: null,
  //     group: "Shelf",
  //   },
  // ],
  // facets: [
  //   {
  //     key: "All",
  //     value: "All",
  //     isBooleanValue: true,
  //     name: "All",
  //     productCount: 3,
  //     shelfResponses: null,
  //     group: "Specials & Great Prices",
  //   },
  //   {
  //     key: "Specials",
  //     value: "Specials",
  //     isBooleanValue: true,
  //     name: "Specials",
  //     productCount: 2,
  //     shelfResponses: null,
  //     group: "Specials & Great Prices",
  //   },
  //   {
  //     key: "Great Price",
  //     value: "Great Price",
  //     isBooleanValue: true,
  //     name: "Great Price",
  //     productCount: 1,
  //     shelfResponses: null,
  //     group: "Specials & Great Prices",
  //   },
  //   {
  //     key: "PiesAttributes",
  //     value: "Dairy Free",
  //     isBooleanValue: false,
  //     name: "Dairy Free",
  //     productCount: 16,
  //     shelfResponses: null,
  //     group: "Dietary & Lifestyle",
  //   },
  //   {
  //     key: "PiesAttributes",
  //     value: "Gluten Free",
  //     isBooleanValue: false,
  //     name: "Gluten Free",
  //     productCount: 17,
  //     shelfResponses: null,
  //     group: "Dietary & Lifestyle",
  //   },
  //   {
  //     key: "PiesAttributes",
  //     value: "Low Salt",
  //     isBooleanValue: false,
  //     name: "Low Salt",
  //     productCount: 3,
  //     shelfResponses: null,
  //     group: "Dietary & Lifestyle",
  //   },
  //   {
  //     key: "PiesAttributes",
  //     value: "Low Sugar",
  //     isBooleanValue: false,
  //     name: "Low Sugar",
  //     productCount: 3,
  //     shelfResponses: null,
  //     group: "Dietary & Lifestyle",
  //   },
  // ],
  // sortOptions: [
  //   {
  //     value: "PriceAsc",
  //     text: "Price Low to High",
  //     selected: false,
  //   },
  //   {
  //     value: "PriceDesc",
  //     text: "Price High to Low",
  //     selected: false,
  //   },
  //   {
  //     value: "CUPAsc",
  //     text: "Unit Price Low to High",
  //     selected: false,
  //   },
  //   {
  //     value: "BrowseRelevance",
  //     text: "Relevance",
  //     selected: true,
  //   },
  // ],
  // currentPageSize: 48,
  // currentSortOption: "BrowseRelevance",
  // breadcrumb: {
  //   department: {
  //     key: "Department",
  //     value: 2,
  //     isBooleanValue: false,
  //     name: "Meat & Poultry",
  //     productCount: 0,
  //     shelfResponses: null,
  //     group: null,
  //   },
  //   aisle: {
  //     key: "Aisle",
  //     value: 88,
  //     isBooleanValue: false,
  //     name: "Beef",
  //     productCount: 0,
  //     shelfResponses: null,
  //     group: null,
  //   },
  //   shelf: {
  //     key: "Shelf",
  //     value: 548,
  //     isBooleanValue: false,
  //     name: "Steak",
  //     productCount: 0,
  //     shelfResponses: null,
  //     group: null,
  //   },
  //   productGroup: null,
  //   dynamicGroup: null,
  // },
  // rootUrl: "http://shop.countdown.co.nz",
  // context: {
  //   fulfilment: {
  //     address: "Glenfield",
  //     selectedDate: null,
  //     selectedDateWithTZInfo: null,
  //     startTime: null,
  //     endTime: null,
  //     method: "Courier",
  //     cutOffTime: null,
  //     isSlotToday: false,
  //     isAddressInDeliveryZone: true,
  //     isDefaultDeliveryAddress: false,
  //     areaId: 77,
  //     suburbId: 0,
  //     pickupAddressId: 0,
  //     fulfilmentStoreId: 9443,
  //     perishableCode: "P",
  //     locker: null,
  //     expressFulfilment: {
  //       isExpressSlot: false,
  //       expressPickUpFee: null,
  //       expressDeliveryFee: null,
  //     },
  //   },
  // },
});

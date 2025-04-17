import { RetailerCodec, type CategoryTreeNode, type DBClient } from "@repo/db";
import * as t from "@repo/io-ts";
import { notEmpty } from "@repo/utils";
import { Meilisearch } from "meilisearch";

type IndexedStoreData = t.TypeOf<typeof IndexedStoreData>;
export type IndexedStoreDataJSON = t.OutputOf<typeof IndexedStoreData>;
const IndexedStoreData = t.strict(
  {
    id: t.string,
    retailer: RetailerCodec,
    name: t.string,
    description: t.string,
    lastSyncedAt: t.string,
    _geo: t.optional(
      t.strict({
        lat: t.string,
        lng: t.string,
      })
    ),
    // returned by meilisearch
    _geoDistance: t.optional(t.number),
  },
  "IndexedStoreData"
);

type IndexedProductData = t.TypeOf<typeof IndexedProductData>;
export type IndexedProductDataJSON = t.OutputOf<typeof IndexedProductData>;
const IndexedProductData = t.strict(
  {
    id: t.string,
    title: t.string,
    brand: t.string,
    description: t.string,
    image: t.optional(t.string),
    categories: t.array(t.string),
    stores: t.array(t.string),
  },
  "IndexedProductData"
);

export class SearchClient {
  __brand!: "SearchClient";

  constructor(public readonly raw: Meilisearch) {}

  public static create(host: string, apiKey: string) {
    return new SearchClient(
      new Meilisearch({
        host,
        apiKey,
      })
    );
  }

  async createStoreIndex() {
    // real index
    await this.raw.createIndex("stores", {
      primaryKey: "id",
    });
    // swap index
    await this.raw.createIndex("stores-tmp", {
      primaryKey: "id",
    });
    const index = this.raw.index<IndexedStoreData>("stores-tmp");
    await index.deleteAllDocuments();
    await index.updateSearchableAttributes(["name", "description"]);
    await index.updateSortableAttributes(["_geo"]);
    await index.updateDisplayedAttributes([
      "id",
      "retailer",
      "name",
      "description",
      "lastSyncedAt",
      "_geo",
    ]);
    return index;
  }

  async recreateScratchProductIndex() {
    // real index
    await this.raw.createIndex("products", {
      primaryKey: "id",
    });
    // swap index
    await this.raw.createIndex("products-tmp", {
      primaryKey: "id",
    });
    const index = this.raw.index<IndexedProductData>("products-tmp");
    await index.deleteAllDocuments();
    await index.updateSearchableAttributes([
      "_title",
      "description",
      "_category",
    ]);
    await index.updateFilterableAttributes(["categories", "stores"]);
    return index;
  }

  get storesIndex() {
    return this.raw.index<IndexedStoreData>("stores");
  }

  get productIndex() {
    return this.raw.index<IndexedProductData>("products");
  }

  get productScratchIndex() {
    return this.raw.index<IndexedProductData>("products-tmp");
  }

  async syncStoreIndex(db: DBClient) {
    const ix = await this.createStoreIndex();
    const rows = await db.iterateStoresForSearchIndex();
    const data = rows.map((row): IndexedStoreData => {
      return {
        id: row.id,
        retailer: row.retailer,
        name: row.json.name ?? "",
        lastSyncedAt: row.lastSyncedAt?.toISOString() ?? "",
        description: "", // N/A
        _geo: row.location
          ? {
              lat: row.location.x.toString(),
              lng: row.location.y.toString(),
            }
          : null,

        // returned by meilisearch; not an input.
        _geoDistance: undefined,
      };
    });
    await ix.addDocuments(data, {
      primaryKey: "id",
    });
    await this.raw.swapIndexes([{ indexes: ["stores", "stores-tmp"] }]);
    return data.length;
  }

  async prepareScratchProductIndex(db: DBClient) {
    await this.recreateScratchProductIndex();
  }

  async swapScratchProductIndex() {
    await this.raw.swapIndexes([{ indexes: ["products", "products-tmp"] }]);
  }

  // IMPORTANT must be preceeded by 'prepareScratchProductIndex' and should be
  //           followed by 'swapScratchProductIndex' for a successful sync.
  async syncProductIndexPage(db: DBClient, page: number): Promise<number> {
    const limit = 10000;

    // TODO pass this in? or just keep loading it on every page...
    const cats = await db.getCategoryTree();

    // find cat by id in tree
    function findCat(
      id: string,
      cats: CategoryTreeNode[],
      level: number = 0
    ): string | null {
      for (const cat of cats) {
        if (cat.id === id && level > 0 /* skip root */) {
          return cat.name;
        }
        if (cat.children) {
          const child = findCat(id, cat.children, level + 1);
          if (child) {
            return child;
          }
        }
      }
      return null;
    }

    const rows = await db.iterateMetaProductsForSearchIndex({
      page,
      limit,
    });

    if (rows.length === 0) {
      return 0;
    }

    const data = rows.map(
      (
        row
      ): IndexedProductData & {
        _title: string; // better search results
        _category: string; // better search results
      } => {
        return {
          id: row.id,
          title: row.title ?? "",
          _title: `${row.title ?? ""} ${row.brand ?? ""}`,
          _category:
            row.categoryIds
              ?.map((id) => findCat(id, cats))
              .filter(notEmpty)
              .join(",") ?? "",
          description: row.description ?? "",
          image: row.json?.image ?? null,
          brand: row.brand ?? "",
          categories: row.categoryIds ?? [],
          stores: row.stores ?? [],
        };
      }
    );

    // write to scratch index
    const ix = this.productScratchIndex;
    await ix.addDocuments(data, {
      primaryKey: "id",
    });

    return data.length;
  }

  async searchCatalog({
    page,
    query,
    limit,
    category,
    stores,
  }: {
    page: number;
    query: string;
    limit: number;
    category?: string;
    stores?: string[];
  }): Promise<{
    hits: IndexedProductData[];
    total: number;
    limit: number;
    offset: number;
  }> {
    // remove all '"' from category
    // this shouldn't be necessary, but just in case someone is being a dick
    // since meilisearch doesn't have parameterized queries and relies on
    // building strings like we're back in the 90s. But since filters always
    // reduce the result set even if the user manages to break out of the
    // sandbox, they cannot really do any damage.
    category = category?.replace(/"/g, "");
    stores ??= [];

    const storeFilter = [
      stores.map((store) => {
        return `stores = ${store}`;
      }),
    ];
    const result = await this.productIndex.search(query, {
      limit,
      offset: (page - 1) * limit,
      filter: category
        ? [...storeFilter, `categories = "${category}"`]
        : [...storeFilter],
    });
    return {
      hits: result.hits
        .map((x) => t.decodeMaybe(IndexedProductData, x))
        .filter(notEmpty),
      total: result.estimatedTotalHits,
      limit: result.limit,
      offset: result.offset,
    };
  }

  async searchStores({
    query,
    geo,
    limit,
  }: {
    query: string;
    geo?: {
      lat: string;
      lng: string;
    };
    limit: number;
  }): Promise<IndexedStoreData[]> {
    const result = await this.storesIndex.search(query, {
      limit,
      sort: geo ? [`_geoPoint(${geo.lat},${geo.lng}):asc`] : [],
    });

    return result.hits
      .map((x) => t.decodeMaybe(IndexedStoreData, x))
      .filter(notEmpty);
  }
}

import * as t from "@repo/io-ts";
import { fetchDecoded, notEmpty } from "@repo/utils";
import * as L from "@sylo/logger";
import * as E from "fp-ts/lib/Either.js";
import { ProductSearchResultCodec } from "./codecs.js";
import { ProxyAgent } from "undici";

type Config = {
  proxyUrl?: string;
};

interface CategoryTreeNode {
  id: string;
  name: string;
  children: CategoryTreeNode[];
}

// these headers are required for the countdown API to respond as if we were a
// customer on their website.
const headers = {
  "x-requested-with": "OnlineShopping.WebApp",
  "user-agent":
    "Mozilla/5.0 (Linux; Android 10; SM-A205U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/102.0.5005.99 Mobile Safari/537.36",
};

function proxyUrlsFromEnv(): string[] {
  const urls = process.env.SHOPSTER_PROXY_URLS;
  if (!urls) {
    const url = process.env.SHOPSTER_PROXY_URL;
    if (url) return [url];
    return [];
  }
  return urls.split(",");
}

function randomProxyUrlFromEnv(): string | null {
  const urls = proxyUrlsFromEnv();
  if (urls.length === 0) return null;
  return urls[Math.floor(Math.random() * urls.length)]!;
}

function getAgent(config?: Config) {
  const url = config?.proxyUrl || randomProxyUrlFromEnv();
  if (!url) return undefined;
  return new ProxyAgent(url);
}

export async function getStoresV2(config?: Config) {
  const agent = getAgent(config);
  const r = await fetchDecoded(
    fetch("https://www.woolworths.co.nz/api/v1/addresses/pickup-addresses", {
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "en-GB,en-US;q=0.9,en;q=0.8,zh-CN;q=0.7,zh;q=0.6",
        pragma: "no-cache",
        priority: "u=1, i",
        "sec-ch-ua":
          '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "cross-site",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "x-dtreferer": "https://www.woolworths.co.nz/bookatimeslot",
        "x-requested-with": "OnlineShopping.WebApp",
        "x-ui-ver": "7.53.77",
      },
      method: "GET",
      body: null,
      // TODO(TS) this option works fine, but the type definition is not correct
      // @ts-ignore
      dispatcher: agent,
    }),
    {
      200: (raw) =>
        toEither(
          t.fromJSONString(
            t.type(
              {
                storeAreas: t.array(
                  t.strict(
                    {
                      id: t.number,
                      name: t.string,
                      storeAddresses: t.array(
                        t.type({
                          id: t.number,
                          name: t.string,
                          address: t.string,
                        })
                      ),
                    },
                    "StoreArea"
                  )
                ),
              },
              "Response"
            ),
            raw
          )
        ),
    }
  );

  if (r._tag === "Left") {
    throw new Error("failed to fetch stores; error=" + r.left);
  }

  return r.right.storeAreas;
}

export async function getStoresV1(config?: Config) {
  const agent = getAgent(config);
  const r = await fetchDecoded(
    fetch("https://api.cdx.nz/site-location/api/v1/sites/search", {
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "en-GB,en-US;q=0.9,en;q=0.8,zh-CN;q=0.7,zh;q=0.6",
        priority: "u=1, i",
        "sec-ch-ua":
          '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "cross-site",
        Referer: "https://www.woolworths.co.nz/",
        "user-agent":
          "Mozilla/5.0 (Linux; Android 10; SM-A205U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/102.0.5005.99 Mobile Safari/537.36",
        "Referrer-Policy": "strict-origin-when-cross-origin",
      },
      body: null,
      method: "GET",
      // TODO(TS) this option works fine, but the type definition is not correct
      // @ts-ignore
      dispatcher: agent,
    }),
    {
      200: (raw) =>
        toEither(
          t.fromJSONString(
            t.strict(
              {
                items: t.array(
                  t.strict(
                    {
                      id: t.string,
                      name: t.string,
                      suburb: t.string,
                      state: t.string,
                      postcode: t.string,
                      facilities: t.array(t.string),
                    },
                    "Item"
                  )
                ),
              },
              "Response"
            ),
            raw
          )
        ),
    }
  );

  if (r._tag === "Left") {
    throw new Error("failed to fetch stores; error=" + r.left);
  }

  return r.right.items;
}

type Product = Extract<
  t.OutputOf<typeof ProductSearchResultCodec>["products"]["items"][number],
  { type: "Product" }
>;

export async function getShell(storeId: string | null, config?: Config) {
  const agent = getAgent(config);
  const result = await fetchDecoded(
    fetch("https://www.woolworths.co.nz/api/v1/shell", {
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-language": "en-GB,en;q=0.9",
        "cache-control": "no-cache",
        "content-type": "application/json",
        expires: "Sat, 01 Jan 2000 00:00:00 GMT",
        pragma: "no-cache",
        priority: "u=1, i",
        "sec-ch-ua":
          '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "x-requested-with": "OnlineShopping.WebApp",
        "x-ui-ver": "7.51.67",
        Referer: "https://www.woolworths.co.nz/",
        "Referrer-Policy": "strict-origin-when-cross-origin",

        // select store
        cookie: storeId == null ? "" : `cw-lrkswrdjp=dm-Pickup,f-${storeId}`,
      },
      body: null,
      method: "GET",
      // TODO(TS) this option works fine, but the type definition is not correct
      // @ts-ignore
      dispatcher: agent,
    }),
    {
      200: (raw) =>
        toEither(
          t.fromJSONString(
            t.strict(
              {
                mainNavs: t.array(
                  t.strict(
                    {
                      label: t.string,
                      navigationItems: t.optional(
                        t.array(
                          t.strict({
                            items: t.optional(
                              t.array(
                                t.strict(
                                  {
                                    id: t.number,
                                    label: t.string,
                                    url: t.string,
                                    dasFacets: t.optional(
                                      t.array(
                                        t.strict(
                                          {
                                            name: t.string,
                                            value: t.string,
                                            shelfResponses: t.array(
                                              t.strict(
                                                {
                                                  id: t.number,
                                                  label: t.string,
                                                },
                                                "ShelfResponse"
                                              )
                                            ),
                                          },
                                          "DasFacet"
                                        )
                                      )
                                    ),
                                  },
                                  "Item"
                                )
                              )
                            ),
                          })
                        )
                      ),
                    },
                    "MainNav"
                  )
                ),
              },
              "Response"
            ),
            raw
          )
        ),
    }
  );

  if (result._tag === "Left") {
    throw new Error("failed to fetch shell; error=" + result.left);
  }

  // resolve cateogries
  const categoryRoots: CategoryTreeNode[] = [];
  for (const mainNav of result.right.mainNavs) {
    if (mainNav.label !== "Browse") continue;

    // this has been found by trial and error and looks a bit fragile and
    // non-sensical, but it works for now.
    const items = mainNav.navigationItems?.[0]?.items;
    if (!items) {
      console.error("no items found in main nav; cannot resolve categories");
      break;
    }

    for (const l1 of items) {
      // level 1 - categories
      const level1: CategoryTreeNode = {
        id: l1.id.toString(),
        name: l1.label,
        children: [],
      };
      categoryRoots.push(level1);

      // level 2 - facets
      for (const l2 of l1.dasFacets ?? []) {
        const level2: CategoryTreeNode = {
          id: l2.value,
          name: l2.name,
          children: [],
        };
        level1.children.push(level2);

        // level 3 - shelfs
        for (const l3 of l2.shelfResponses) {
          const level3: CategoryTreeNode = {
            id: l3.id.toString(),
            name: l3.label,
            children: [],
          };
          level2.children.push(level3);
        }
      }
    }
  }

  return {
    categories: categoryRoots,
  };
}

export async function searchProducts(
  {
    page,
    dasFilters,
    storeId,
  }: {
    page: number;
    dasFilters: string[];
    storeId: string;
  },
  config?: Config,
  logger = L.noopLogger
): Promise<
  E.Either<
    string,
    {
      products: Product[];
      totalItems: number;
    }
  >
> {
  const agent = getAgent(config);
  const params = new URLSearchParams({
    target: "browse",
    inStockProductsOnly: "false",
    size: "48", // maximum, it seems! found out by trial and error
  });

  const p = new URLSearchParams(params);
  if (page > 0) {
    p.set("page", `${page}`);
  }
  for (const dasFilter of dasFilters) {
    p.append("dasFilter", dasFilter);
  }

  const url = "https://www.woolworths.co.nz/api/v1/products?" + p.toString();
  logger.d("querying url=" + url);
  const r = await fetchDecoded(
    fetch(url, {
      headers: {
        ...headers,
        // select store
        cookie: `cw-lrkswrdjp=dm-Pickup,f-${storeId}`,
      },
      // TODO(TS) this option works fine, but the type definition is not correct
      // @ts-ignore
      dispatcher: agent,
    }),
    {
      200: (raw) => toEither(t.fromJSONString(ProductSearchResultCodec, raw)),
      400: (raw) => {
        logger.e("bad request; body=" + raw);
        return E.left<string, t.TypeOf<typeof ProductSearchResultCodec>>(
          "bad request; response=" + raw
        );
      },
    }
  );

  if (E.isLeft(r)) return r;
  return E.right({
    products: r.right.products.items
      .map((p) => (p.type === "Product" ? p : null))
      .filter(notEmpty),
    totalItems: r.right.products.totalItems,
  });
}

function toEither<T>(v: t.Validation<T>): E.Either<string, T> {
  return E.mapLeft(t.report)(v);
}

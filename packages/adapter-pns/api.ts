/**
 * This module provides access to the New World and Pak'n'Save APIs.
 * Both stores are owned by the same company & share a common endpoint & API.
 */

import * as t from "@repo/io-ts";
import { fetchDecoded } from "@repo/utils";
import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import { jwtDecode } from "jwt-decode";
import { ProxyAgent } from "undici";
import {
  type ProductSearchResult,
  ProductSearchResultCodec,
  StoreCodec,
} from "./codecs.js";
import type { ITokenStore } from "./ITokenStore.js";

const MOBILE_BASE_URL = "https://api-prod.prod.fsniwaikato.kiwi/prod/mobile";
const NW_BASE_URL = "https://www.newworld.co.nz//CommonApi";
const PNS_BASE_URL = "https://www.paknsave.co.nz//CommonApi";
const ACCESS_TOKEN_SLIPPAGE = 5 * 60 * 1000;

type Retailer = "pns" | "nw";

type Config = {
  proxyUrl?: string;
};

const noAuthHeader = {
  accept: "application/json, text/plain, */*",
  connection: "Keep-Alive",
  "accept-encoding": "gzip",
  "cache-control": "no-cache",
  "content-type": "application/json",
  "user-agent": "PAKnSAVEApp/4.3.0 (Android 12)",
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

async function getGuestAccessToken(retailer: Retailer, config?: Config) {
  const agent = getAgent(config);
  const url = `${MOBILE_BASE_URL}/user/login/guest`;
  const r = await fetchDecoded(
    fetch(url, {
      method: "POST",
      headers: noAuthHeader,
      body: JSON.stringify({
        banner: retailer === "pns" ? "PNS" : "MNW",
      }),
      // TODO(TS) this option works fine, but the type definition is not correct
      // @ts-ignore
      dispatcher: agent,
    }),
    {
      200: (raw) =>
        toEither(
          t.fromJSONString(
            t.strict({
              access_token: t.string,
              refresh_token: t.string,
            }),
            raw
          )
        ),
    }
  );
  if (E.isLeft(r)) return r;
  return E.right(r.right);
}

async function getGuestAccessTokenWithRefreshToken(
  retailer: Retailer,
  refreshToken: string,
  config?: Config
) {
  const url = `${MOBILE_BASE_URL}/v1/users/login/refreshtoken`;
  const agent = getAgent(config);
  const r = await fetchDecoded(
    fetch(url, {
      method: "POST",
      headers: noAuthHeader,
      body: JSON.stringify({ refreshToken }),
      redirect: "follow",
      // TODO(TS) this option works fine, but the type definition is not correct
      // @ts-ignore
      dispatcher: agent,
    }),
    {
      200: (raw) =>
        toEither(
          t.fromJSONString(
            t.type({
              access_token: t.string,
              refresh_token: t.string,
            }),
            raw
          )
        ),
    }
  );
  if (E.isLeft(r)) return r;
  return r;
}

function isTokenExpired(token: string) {
  const decoded: null | { exp: number } = jwtDecode(token);
  if (decoded == null || decoded.exp == null) {
    throw new Error("Invalid token");
  }
  return Date.now() + ACCESS_TOKEN_SLIPPAGE >= decoded.exp * 1000;
}

export async function getOrRefreshAccessToken(
  retailer: Retailer,
  storeId: string,
  tokenStore: ITokenStore,
  fresh = false,
  config?: Config
): Promise<string> {
  const token = fresh ? null : await tokenStore.get(retailer, storeId);
  if (token == null) {
    const r = await getGuestAccessToken(retailer, config);
    if (E.isLeft(r)) {
      console.error(r);
      throw new Error("Failed to get guest access token");
    }

    const token = r.right.access_token;
    const agent = getAgent(config);
    const r2 = await fetchDecoded(
      fetch(`https://api-prod.newworld.co.nz/v1/edge/cart/store/${storeId}`, {
        // ${storeId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Referer: "https://www.paknsave.co.nz/",
          Authorization: `Bearer ${token}`,
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
        },
        // TODO(TS) this option works fine, but the type definition is not correct
        // @ts-ignore
        dispatcher: agent,
      }),
      {
        200: (raw) => {
          return E.right(null);
        },
      }
    );

    if (r2._tag === "Left") {
      console.error("failed to activate store; error=" + r2.left);
      throw new Error("Failed to activate cart; error=" + r2.left);
    }

    // XXX we could run this fetch request to confirm that the store is active,
    //     but we really should not need to if the above request succeeded.
    //
    // await fetchDecoded(
    //   fetch("https://api-prod.newworld.co.nz/v1/edge/cart", {
    //     headers: {
    //       "Content-Type": "application/json",
    //       Authorization: `Bearer ${token}`,
    //       "user-agent":
    //         "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
    //     },
    //   }),
    //   {
    //     200: (raw) => {
    //       console.log("cart", raw);
    //       return E.right(null);
    //     },
    //   }
    // )

    await tokenStore.set(retailer, storeId, {
      accessToken: r.right.access_token,
      refreshToken: r.right.refresh_token,
    });
    return r.right.access_token;
  }
  if (isTokenExpired(token.accessToken) && token.refreshToken != null) {
    const newToken = await getGuestAccessTokenWithRefreshToken(
      retailer,
      token.refreshToken
    );
    if (E.isLeft(newToken)) {
      await tokenStore.delete(retailer, storeId);
      if (!fresh) {
        return getOrRefreshAccessToken(retailer, storeId, tokenStore, true);
      }
      throw new Error("Failed to refresh access token; error=" + newToken.left);
    }
    await tokenStore.set(retailer, storeId, {
      accessToken: newToken.right.access_token,
      refreshToken: newToken.right.refresh_token,
    });
    return newToken.right.access_token;
  }
  return token.accessToken;
}

function getAuthHeaders(token: { accessToken: string }) {
  return {
    ...noAuthHeader,
    authorization: `Bearer ${token.accessToken}`,
  };
}

export async function getStores(retailer: Retailer, config?: Config) {
  const url =
    retailer === "nw"
      ? `${NW_BASE_URL}/Store/GetStoreList`
      : `${PNS_BASE_URL}/Store/GetStoreList`;
  const agent = getAgent(config);
  return fetchDecoded(
    fetch(url, {
      method: "GET",
      headers: noAuthHeader,

      // TODO(TS) this option works fine, but the type definition is not correct
      // @ts-ignore
      dispatcher: agent,
    }),
    {
      200: (raw) => {
        return pipe(
          toEither(
            t.fromJSONString(
              t.strict({
                stores: t.array(StoreCodec),
              }),
              raw
            )
          ),
          E.map((x) => x.stores)
        );
      },
    }
  );
}

export async function getCategories(
  storeId: string,
  retailer: Retailer,
  tokenStore: ITokenStore,
  config?: Config
) {
  const token = await getOrRefreshAccessToken(retailer, storeId, tokenStore);
  const agent = getAgent(config);
  const r = await fetchDecoded(
    // this URL is the same for both NW and PNS
    fetch(
      `https://api-prod.newworld.co.nz/v1/edge/store/${storeId}/categories`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
        },
        // TODO(TS) this option works fine, but the type definition is not correct
        // @ts-ignore
        dispatcher: agent,
      }
    ),
    {
      200: (raw) => {
        return toEither(
          t.fromJSONString(
            t.array(
              t.strict({
                name: t.string,
                children: t.optional(
                  t.array(
                    t.strict({
                      name: t.string,
                      children: t.optional(
                        t.array(
                          t.strict({
                            name: t.string,
                          })
                        )
                      ),
                    })
                  )
                ),
              })
            ),
            raw
          )
        );
      },
    }
  );
  if (E.isLeft(r)) {
    console.error("failed to fetch categories", r);
    throw new Error("Failed to fetch categories");
  }

  const index = new Set<string>();
  const out: {
    l0: string;
    l1?: string;
    l2?: string;
  }[] = [];
  for (const l0 of r.right) {
    if (l0.children == null || l0.children.length === 0) {
      const k = l0.name;
      if (index.has(k)) {
        continue;
      }
      index.add(k);
      out.push({ l0: l0.name });
      continue;
    }

    for (const l1 of l0.children) {
      // TODO currently we only support l2; so skip this check.
      // if (l1.children == null || l1.children.length === 0) {
      const k = l0.name + "///" + l1.name;
      if (index.has(k)) {
        continue;
      }
      index.add(k);
      out.push({ l0: l0.name, l1: l1.name });
      continue;
      // }
    }
  }
  return out;
}

export async function searchProducts(
  retailer: Retailer,
  {
    tokenStore,
    storeId,
    page,
    category0NI,
    category1NI,
    // category2NI,
  }: {
    tokenStore: ITokenStore;
    storeId: string;
    page: number;
    category0NI?: string;
    category1NI?: string;
    // category2NI?: string;
  },
  config?: Config
): Promise<ProductSearchResult | null> {
  const category2NI = undefined; // XXX not supported for now

  const token = await getOrRefreshAccessToken(retailer, storeId, tokenStore);
  const agent = getAgent(config);
  const r = await fetchDecoded(
    // this URL is the same for both NW and PNS
    fetch("https://api-prod.newworld.co.nz/v1/edge/search/paginated/products", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({
        algoliaQuery: {
          attributesToHighlight: [],
          attributesToRetrieve: [
            "productID",
            "Type",
            "sponsored",
            "category0NI",
            "category1NI",
            "category2NI",
          ],
          facets: ["brand", "category1NI", "onPromotion", "productFacets"],
          filters:
            `stores:${storeId}` +
            (category0NI ? ` AND category0NI:"${category0NI}"` : "") +
            (category1NI ? ` AND category1NI:"${category1NI}"` : "") +
            (category2NI ? ` AND category2NI:"${category2NI}"` : ""),
          highlightPostTag: "__/ais-highlight__",
          highlightPreTag: "__ais-highlight__",
          hitsPerPage: 50,
          maxValuesPerFacet: 100,
          page,
        },
        storeId,
        hitsPerPage: 50,
        page,
        sortOrder: "NI_POPULARITY_ASC",
        tobaccoQuery: false,
        disableAds: true,
        publishImpressionEvent: false,
        precisionMedia: {
          adDomain: "CATEGORY_PAGE",
          adPositions: [4, 8, 12, 16],
        },
      }),
      // TODO(TS) this option works fine, but the type definition is not correct
      // @ts-ignore
      dispatcher: agent,
    }),
    {
      400: (raw) => {
        // XXX this appears to be an internal error that we can't do anything
        //     about; so we just ignore it.
        if (raw.includes("nz.co.foodstuffs.retailproductsearch")) {
          return E.right(null);
        }

        // we get this other mysterious 400 some times with a message of "".
        // It's not clear what this is about, but we just ignore it for now.
        try {
          const parsed = JSON.parse(raw);
          if (parsed.message === "") {
            console.warn(
              "[pns]WARNING: Mysterious 400 with empty message; ignoring."
            );
            return E.right(null);
          }
        } catch (e) {
          // ignore
        }

        console.log("failed to fetch products", raw);
        return E.left<string, ProductSearchResult>(raw);
      },
      200: (raw) => {
        return toEither(t.fromJSONString(ProductSearchResultCodec, raw));
      },
      401: () => {
        return E.left<string, ProductSearchResult>("Unauthorized");
      },
    }
  );
  if (r._tag === "Left") {
    console.error("failed to fetch products", r.left);
    throw new Error("Failed to fetch products");
  }
  return r.right;
}

export async function getProductDetails(
  {
    retailer,
    storeId,
    productId,
    tokenStore,
  }: {
    retailer: Retailer;
    storeId: string;
    productId: string;
    tokenStore: ITokenStore;
  },
  config?: Config
) {
  const token = await getOrRefreshAccessToken(retailer, storeId, tokenStore);
  const agent = getAgent(config);
  const r = await fetchDecoded(
    // this URL is the same for both NW and PNS
    fetch(
      `https://api-prod.newworld.co.nz/v1/edge/store/${storeId}/product/${productId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
        },
        // TODO(TS) this option works fine, but the type definition is not correct
        // @ts-ignore
        dispatcher: agent,
      }
    ),
    {
      200: (raw) => {
        return toEither(
          t.fromJSONString(
            t.strict(
              {
                sku: t.optional(t.string),
                // images: t.optional(
                //   t.strict(
                //     {
                //       primaryImages: t.optional(t.record(t.string, t.string)),
                //       alternateImages: t.optional(
                //         t.array(
                //           t.strict(
                //             {
                //               url: t.string,
                //               facing: t.string,
                //               state: t.string,
                //               angle: t.string,
                //               contentType: t.string,
                //               width: t.number,
                //               height: t.number,
                //             },
                //             "AlternateImage"
                //           )
                //         )
                //       ),
                //     },
                //     "Images"
                //   )
                // ),
              },
              "ProductDetails"
            ),
            raw
          )
        );
      },
    }
  );

  return r;
}

function toEither<T>(v: t.Validation<T>): E.Either<string, T> {
  return E.mapLeft(t.report)(v);
}

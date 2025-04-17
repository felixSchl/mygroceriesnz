// IMPORTANT we (intent to) integrate with supertokens which manages the 'auth'
//           schema so we must be careful not to generate migrations that would
//           interfere with it. To do so we only re-export the tables we manage
//           ourselves so that drizzle won't pick up on any others.
//       SEE drizze.config.ts to see how it is used.

export {
  brandTable,
  cacheTable,
  metaProductTable,
  productInStoreTable,
  productTable,
  storeTable,
  jobTable,
  categoryMappingTable,
  configTable,
  pisKeyMappingTable,
  historicalPriceTable,

  // TODO we only load this file via bunx when we are generating migrations.
  //      For some reason that tooling doesn't know how to load the schema
  //      if we import it as './schema.js.' Just ignore this and move on.
  // @ts-ignore
} from "./schema.ts";

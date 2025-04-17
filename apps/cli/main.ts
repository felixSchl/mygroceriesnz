import { DBClient } from "@repo/db";
import { $ } from "bun";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL!;
if (!databaseUrl) {
  die("DATABASE_URL is required");
}

let client: DBClient | null = null;
function getDBClient() {
  if (!client) {
    client = DBClient.create(databaseUrl);
  }
  return client;
}

process.stdin.resume();
await yargs(hideBin(process.argv))
  .strictCommands()

  /// We are downloading price history every day but don't want to pay for the
  /// storage as it's not a public facing feature just yet. So we download the
  /// data and then deletes it from the remote.
  .command("download-price-history", "Download price history", async () => {
    const timestamp = new Date().toISOString().replace(/[-:Z]/g, "");

    // prepare the download directory
    await $`mkdir -p data`;

    const filename = `data/price_history-${timestamp}.sql`;

    // sanity check we're not overwriting existing files
    if (await Bun.file(filename).exists()) {
      die(`File ${filename} already exists`);
    }

    // download the data
    console.log("Downloading data...");
    await $`
        pg_dump ${databaseUrl} \
          --data-only \
          --table historical_price \
          > ${filename}`;

    // now truncate the remote data
    console.log("Truncating table...");
    await $`
        psql ${databaseUrl} \
          -c "TRUNCATE TABLE historical_price;"
      `;
  })
  .command("table-stats", "Print table size statistics", async () => {
    await $`
        psql ${databaseUrl} \
          -c "
            select
              table_name,
              pg_size_pretty(pg_total_relation_size(quote_ident(table_name))),
              pg_total_relation_size(quote_ident(table_name))
            from information_schema.tables
            where table_schema = 'public'
            order by 3 desc;
          "
      `;
  })
  .demandCommand(1)
  .parse();
process.exit();

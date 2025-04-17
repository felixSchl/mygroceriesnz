import migrations from "@/migrations/migrations";
import { eq, InferSelectModel } from "drizzle-orm";
import { drizzle } from "drizzle-orm/expo-sqlite";
import { migrate } from "drizzle-orm/expo-sqlite/migrator";
import { SQLiteUpdateSetSource } from "drizzle-orm/sqlite-core";
import { openDatabaseAsync, SQLiteDatabase } from "expo-sqlite";
import {
  appStateTable,
  DEFAULT_APP_STATE_ID,
  DEFAULT_LIST_ID,
  listTable,
} from "./schema";

declare global {
  var __DB__: Promise<SQLiteDatabase> | undefined;
}

export type AppState = Omit<InferSelectModel<typeof appStateTable>, "id">;
export type List = Omit<InferSelectModel<typeof listTable>, "items"> & {
  items: NonNullable<InferSelectModel<typeof listTable>["items"]>;
};

const defaultAppState: AppState = {
  activeListId: DEFAULT_LIST_ID,
  selectedStores: [],
  useLocationInSearch: false,
};

export class DBClient {
  private _db: ReturnType<typeof drizzle> = null!;
  private dbFile: string;

  get db() {
    // NOTE this error is for dev purposes only and could be disabled in
    //      production. The app must always call 'migrate()' first before
    //      accessing the db as it initializes the db "connection."
    if (!this._db) {
      throw new Error("DBClient not initialized. Call migrate() first.");
    }
    return this._db;
  }

  constructor(file: string) {
    this.dbFile = file;
  }

  /**
   * Apply any pending database migrations.
   */
  async migrate() {
    // open database if not already open
    if (!this._db) {
      if (!globalThis.__DB__) {
        const raw = await openDatabaseAsync(this.dbFile);
        await raw.execAsync("PRAGMA journal_mode = WAL;");
        this._db = drizzle(raw, {
          logger: true,
        });
      } else {
        this._db = drizzle(await globalThis.__DB__, {
          logger: true,
        });
      }
    }

    // apply migrations
    await migrate(this.db, migrations);
  }

  /**
   * Load application state.
   */
  async loadAppState(): Promise<
    AppState & {
      lists: List[];
    }
  > {
    console.log("loading appstate table...");
    const [row] = await this.db
      .select()
      .from(appStateTable)
      .where(eq(appStateTable.id, DEFAULT_APP_STATE_ID))
      .limit(1)
      .execute();

    console.log("row", row);

    if (!row) {
      // ensure the default app state exists
      // we could upsert everywhere but this is just easier
      console.log("inserting default app state...");
      await this.db.insert(appStateTable).values(defaultAppState).execute();
    }

    // TODO race()
    // TODO suport multiple lists
    console.log("loading list table...");
    const [list] = await this.db
      .select()
      .from(listTable)
      .where(eq(listTable.id, DEFAULT_LIST_ID))
      .limit(1)
      .execute();

    const state = row ?? defaultAppState;
    return {
      ...state,
      lists: list
        ? [
            {
              id: list.id,
              name: list.name,
              items: list.items ?? [],
            },
          ]
        : [],
    };
  }

  async updateAppState(state: Partial<AppState>) {
    const updates: SQLiteUpdateSetSource<typeof appStateTable> = {};

    let i = 0;
    if (state.activeListId) {
      i++;
      updates.activeListId = state.activeListId;
    }

    if (state.selectedStores) {
      i++;
      updates.selectedStores = state.selectedStores;
    }

    if (i === 0) {
      return;
    }

    await this.db
      .update(appStateTable)
      .set(updates)
      .where(eq(appStateTable.id, DEFAULT_APP_STATE_ID))
      .execute();
  }

  async updateList(list: List) {
    await this.db
      .insert(listTable)
      .values({ id: list.id, name: list.name, items: list.items })
      .onConflictDoUpdate({
        target: [listTable.id],
        set: { items: list.items },
      })
      .execute();
  }
}

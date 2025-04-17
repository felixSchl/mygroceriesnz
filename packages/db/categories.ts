/**
 * Module for querying & traversing category trees.
 */

import type { DBClient } from "./client.js";
import type {
  CategoryMappingJSON,
  CategoryTreeNode,
  Retailer,
} from "./schema.js";

export class CategoryTreeQuery {
  private _parentMap: Map<string, string | null> = new Map();
  private _catsById: Map<string, CategoryTreeNode> = new Map();
  private _levels: Map<string, number> = new Map();

  constructor(tree: CategoryTreeNode[]) {
    this.walk(tree, null, (node, parent, level) => {
      this._parentMap.set(node.id, parent);
      this._catsById.set(node.id, node);
      this._levels.set(node.id, level);
    });
  }

  levelOf(catId: string) {
    return this._levels.get(catId) ?? 0;
  }

  walk(
    nodes: CategoryTreeNode[],
    parent: string | null,
    fn: (node: CategoryTreeNode, parent: string | null, level: number) => void,
    level = 0
  ) {
    for (const node of nodes) {
      fn(node, parent, level);
      this.walk(node.children ?? [], node.id, fn, level++);
    }
  }

  has(catId: string) {
    return this._catsById.has(catId);
  }

  get(catId: string) {
    return this._catsById.get(catId);
  }

  parentsOf(catId: string) {
    const parents = [];
    let parent = this._parentMap.get(catId);
    while (parent != null) {
      parents.push(parent);
      parent = this._parentMap.get(parent);
    }
    return parents;
  }
}

/**
 * Helper to make queries of the category tree data structure.
 */
export class CategoryQuery {
  private _target: CategoryTreeQuery;
  private _maps: Partial<Record<Retailer, Map<string, string[]>>> = {};

  constructor(
    target: CategoryTreeNode[],
    sources: Partial<Record<Retailer, CategoryMappingJSON["connections"]>>
  ) {
    this._target = new CategoryTreeQuery(target);
    for (const [retailer, sourceMap] of Object.entries(sources)) {
      const map = new Map<string, string[]>();
      this._maps[retailer as Retailer] = map;
      for (const item of sourceMap) {
        const targets = map.get(item.sourceId) ?? [];
        targets.push(item.targetId);
        map.set(item.sourceId, targets);
      }
    }
  }

  public static async load(db: DBClient) {
    const target = await db.getCategoryTree();
    const ww = await db.getCategoryMappings({ retailer: "ww" });
    const pns = await db.getCategoryMappings({ retailer: "pns" });
    return new CategoryQuery(target, {
      ww,
      nw: pns, // NW uses the same category structure as PNS
      pns,
    });
  }

  public resolve(retailer: Retailer, sourceId: string): Set<string> {
    const sourceMap = this._maps[retailer];
    const out = new Set<string>();
    if (!sourceMap) return out;
    const targets = sourceMap.get(sourceId);
    if (!targets) return out;
    for (const target of targets) {
      const node = this._target.get(target);
      if (!node) continue;
      out.add(node.id);
      for (const parent of this._target.parentsOf(target)) {
        out.add(parent);
      }
    }
    return out;
  }
}

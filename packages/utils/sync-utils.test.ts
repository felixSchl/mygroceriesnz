import { describe, expect, it } from "vitest";
import { concurrently } from "./sync-utils.js";

describe("sync-utils", () => {
  describe("concurrently", () => {
    it("processes items concurrently (0 items)", async () => {
      const items: number[] = [];
      const results: number[] = [];
      const r = concurrently(2, items, async (item) => {
        console.log(item);
        await new Promise((resolve) => setTimeout(resolve, 10));
        results.push(item);
      });
      expect(r).toBeInstanceOf(Promise);
      await r;
      expect(results).toEqual([]);
    });
    it("processes items concurrently", async () => {
      const items = [1, 2, 3, 4, 5];
      const results: number[] = [];
      const r = concurrently(2, items, async (item) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        results.push(item);
      });
      expect(r).toBeInstanceOf(Promise);
      await r;
      expect(results).toEqual([1, 2, 3, 4, 5]);
    });
  });
});

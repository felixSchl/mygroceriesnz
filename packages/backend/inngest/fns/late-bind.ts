import type { InngestClient } from "../client.js";

export default function lateBind<T>(fn: (inngest: InngestClient) => T) {
  return fn;
}

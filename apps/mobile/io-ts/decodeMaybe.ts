import type { Type } from "io-ts";

export function decodeMaybe<A, O>(type: Type<A, O>, input: O): A | null {
  const result = type.decode(input);
  if (result._tag === "Right") {
    return result.right;
  }
  // TODO log this error
  return null;
}

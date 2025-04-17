import * as t from "@repo/io-ts";

export const iots =
  <T>(schema: t.Decoder<unknown, T>) =>
  (value: unknown) => {
    const result = schema.decode(value);
    if (result._tag === "Left") {
      // TODO is there a specific error type we should throw?
      throw new Error(result.left.map(t.getMessage).join("\n"));
    }
    return result.right;
  };

import * as t from "io-ts";
import { MyReporter } from "./reporter.js";
export * from "io-ts";
export * from "io-ts-types";

export type FieldsWith<A, P> = {
  [K in keyof P]-?: A extends P[K] ? K : never;
}[keyof P];

export type FieldsWithout<A, P> = Exclude<keyof P, FieldsWith<A, P>>;

export type MakeOptional<P, U = undefined> = Pick<P, FieldsWithout<U, P>> &
  Partial<Pick<P, FieldsWith<U, P>>>;

export type FixOptionals<C extends t.Mixed> = t.Type<
  MakeOptional<t.TypeOf<C>>,
  t.OutputOf<C>,
  t.InputOf<C>
>;

export function fixOptionals<C extends t.Mixed>(
  c: C
): t.Type<MakeOptional<t.TypeOf<C>>, t.OutputOf<C>, t.InputOf<C>> {
  return c;
}

export function nullable<C extends t.Mixed>(c: C): t.UnionC<[t.NullC, C]> {
  return t.union([t.null, c]);
}

export function optional<C extends t.Mixed>(
  c: C
): t.UnionC<[t.UndefinedC, t.NullC, C]> {
  return t.union([t.undefined, t.null, c]);
}

export type Json = string | number | boolean | Date | JsonArray | JsonObject;

export interface JsonObject {
  [x: string]: string | number | boolean | Date | Json | JsonArray | JsonObject;
}

export type JsonArray = Array<
  string | number | boolean | Date | Json | JsonArray
>;

export * from "./reporter.js";

export function decodeMaybe<A, O>(
  type: t.Type<A, O>,
  input: O,
  log?: (msg: string) => void
): A | null {
  const result = type.decode(input);
  if (result._tag === "Right") {
    return result.right;
  }
  log?.(MyReporter.report(result).join("; and:\n  "));
  return null;
}

export function fromJSONString<A>(
  type: t.Decoder<unknown, A>,
  input: string,
  ctx: t.Context = []
): t.Validation<A> {
  let json: unknown;
  try {
    json = JSON.parse(input);
  } catch (e: unknown) {
    return type.validate(input, ctx);
  }
  return type.validate(json, ctx);
}

export function report(es: t.Errors): string {
  return MyReporter.report({
    _tag: "Left",
    left: es,
  }).join("; and:\n  ");
}

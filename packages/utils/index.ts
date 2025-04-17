import * as E from "fp-ts/lib/Either.js";
import * as gtin from "gtin";
import * as t from "io-ts";

export function roundToTwoPlaces(num: number): number {
  return Math.round(num * 100) / 100;
}

export function hush<L, R>(e: E.Either<L, R>): R | null {
  if (E.isLeft(e)) return null;
  return e.right;
}

export function notEmpty<TValue>(
  value: TValue | null | undefined
): value is TValue {
  if (value === null || value === undefined) return false;
  return true;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function unreachable(x: never): never {
  throw new Error(
    "The impossible happened; this code should be unreachable. Please report this incident."
  );
}

export function notImplemented(name?: string): never {
  if (name) {
    throw new Error(`Not implemented: ${name}`);
  }
  throw new Error("Not implemented");
}

export function renderUnknownError(e: unknown, stack = false): string {
  if (e instanceof Error) {
    if (stack) {
      return e.stack ?? e.message;
    }
    return e.message;
  }
  if (
    typeof e == "object" &&
    e != null &&
    "message" in e &&
    // checks above *should* make this safe...
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    typeof (e as any)["message"] === "string"
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (e as any)["message"];
  }
  if (typeof e === "string") {
    return e;
  }
  return "<unknown error>";
}

export async function tryCatch<T>(
  fn: () => Promise<T>
): Promise<E.Either<unknown, T>> {
  let v: T;
  try {
    v = await fn();
  } catch (e) {
    return E.left(e);
  }
  return E.right(v);
}

type ValueOf<T> = T[keyof T];
type Output<T> = E.Either<
  string,
  ValueOf<{
    [P in keyof T]: T[P] extends (raw: string) => E.Either<string, infer R>
      ? R
      : never;
  }>
>;

type _Response = {
  status: number;
  text: () => Promise<string>;
};

export async function fetchDecoded<
  T extends {
    [status: number]: (raw: string) => E.Either<string, unknown>;
  },
>(
  pendingResponse: (() => Promise<_Response>) | Promise<_Response>,
  decoders: T
): Promise<Output<T>> {
  const resR = await tryCatch(() =>
    typeof pendingResponse === "function" ? pendingResponse() : pendingResponse
  );
  if (E.isLeft(resR)) {
    return E.left(`fetch failed: ${renderUnknownError(resR.left)}`);
  }
  const res = resR.right;
  const decoder = decoders[res.status];
  if (decoder == null) {
    return E.left(`unexpected status code: ${res.status}`);
  }

  const raw = await res.text();
  const result = decoder(raw);

  if (E.isLeft(result)) {
    return E.left(`failed to decode body: ${result.left}`);
  }

  return E.right(result.right) as Output<T>;
}

export function stringify(message: unknown): string {
  if (message === null) {
    return "null";
  }
  if (Array.isArray(message)) {
    return message.map(stringify).join(", ");
  }
  switch (typeof message) {
    case "string":
      return message;
    case "number":
      return String(message);
    case "boolean":
      return String(message);
    case "function":
      return "<Function>";
    case "undefined":
      return "undefined";
    case "object":
      if (message == null) return "null";
      if (message instanceof Error) {
        return message.message;
      } else if (message.constructor && message.constructor.name) {
        return `<${message.constructor.name} ${JSON.stringify(message)}>`;
      } else {
        return JSON.stringify(message);
      }
    default:
      return JSON.stringify(message);
  }
}

export function fromEnv<A = string>(
  key: string,
  fallback?: A,
  validate?: (i: string) => t.Validation<A>
): typeof validate extends undefined ? string : A {
  const value = process.env[key];
  if (value == null) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing environment variable "${key}"`);
  }
  if (validate != null) {
    let r: t.Validation<A>;
    try {
      r = validate(value);
    } catch (e: unknown) {
      console.error(`Bad environment variable for key=${key}:`, value);
      throw new Error("Invalid environment variable");
    }
    if (E.isLeft(r)) {
      throw new Error(
        `Invalid environment variable for key=${key}: ${r.left.join(", ")}`
      );
    }
    return r.right;
  }
  return value as A; // see conditional type (how to convince TS this is safe?)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function validateGTIN(x: string): E.Either<string, string> {
  try {
    if (gtin.isValid(x)) {
      return E.right(x);
    }
  } catch (e: unknown) {
    if (
      e != null &&
      typeof e === "object" &&
      "message" in e &&
      typeof e["message"] === "string"
    ) {
      // the 'gtin' library throws instead of just returning false
      if (e.message.includes("Barcode")) {
        return E.left(e.message);
      }
    }
    throw e;
  }
  return E.left("Invalid GTIN");
}

export * from "./sync-utils.js";

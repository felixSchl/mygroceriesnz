import { type Context, getFunctionName, type ValidationError } from "io-ts";
import type { Reporter } from "io-ts/Reporter";

function stringify(v: any): string {
  if (typeof v === "function") {
    return getFunctionName(v) || "<function>";
  }
  if (typeof v === "number" && !isFinite(v)) {
    if (isNaN(v)) {
      return "NaN";
    }
    return v > 0 ? "Infinity" : "-Infinity";
  }
  if (v === undefined) {
    return "undefined";
  }
  return JSON.stringify(v);
}

function getContextPath(context: Context, value: unknown): string {
  const path = "$/" + context.map(({ key, type }) => `${key}`).join("/");
  const type = context[context.length - 1]?.type.name ?? "?";

  // check arrays
  if (type.startsWith("Array<{")) {
    if (!Array.isArray(value)) {
      // if types don't even match at this level, don't bother with reporting details.
      return `${path}: Array`;
    }
  }

  // check objects
  if (type.startsWith("{|")) {
    // if types don't even match at this level, don't bother with reporting details.
    if (
      value != null &&
      Object.prototype.toString.call(value) !== "[object Object]"
    ) {
      return `${path}: Object`;
    }
  }

  return `${path}: ${type}`;
}

const MAX_VALUE_LEN = 160;
function truncate(s: string): string {
  return s;
  // return s.length > MAX_VALUE_LEN ? s.slice(0, MAX_VALUE_LEN) + "..." : s;
}

function renderTsType(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "Array";
  }
  return typeof value;
}

export function getMessage(e: ValidationError): string {
  return e.message !== undefined
    ? e.message
    : `Invalid value <( ${truncate(stringify(e.value))} )> (${renderTsType(e.value)}) supplied to ${getContextPath(e.context, e.value)}`;
}

function failure(es: Array<ValidationError>): Array<string> {
  return es.map(getMessage);
}

function success(): Array<string> {
  return ["No errors!"];
}

export const MyReporter: Reporter<Array<string>> = {
  report: (v) => {
    if (v._tag === "Left") {
      return failure(v.left);
    }
    return success();
  },
};

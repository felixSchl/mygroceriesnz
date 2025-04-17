import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function debouncer<T extends Function>(fn: T, delay: number): T {
  let timeoutID: number | undefined;
  return function (this: any, ...args: any[]) {
    if (timeoutID != null) {
      clearTimeout(timeoutID);
    }
    const that = this;
    timeoutID = setTimeout(function () {
      fn.apply(that, args);
    }, delay) as unknown as number;
  } as unknown as T;
}

export function notEmpty<TValue>(
  value: TValue | null | undefined,
): value is TValue {
  if (value === null || value === undefined) return false;
  return true;
}

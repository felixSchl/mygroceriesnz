import { z } from "zod";

export function zParseMaybe<T>(t: z.ZodType<T>, data: unknown): T | null {
  const o = t.safeParse(data);
  if (o.success) return o.data;
  return null;
}

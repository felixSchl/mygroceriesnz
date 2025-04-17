/**
 * Schedule synchronous work to be done on the next idle frame.
 * Each 'yield' will interrupt the work and wait for the next idle frame.
 * Use this to avoid blocking the JS thread.
 */
export async function work<T>(
  generator: () => Generator<any, T, any>,
  signal?: AbortSignal
): Promise<T> {
  const it = generator()[Symbol.iterator]();
  while (true) {
    signal?.throwIfAborted();
    const r = await onIdle(() => {
      signal?.throwIfAborted();
      return it.next();
    });
    signal?.throwIfAborted();
    if (r.done) {
      return r.value;
    }
  }
}

/**
 * Perform a synchronous task on the next idle frame.
 * Use this to avoid blocking the JS thread.
 */
export function onIdle<T>(fn: () => T, ac?: AbortController): Promise<T> {
  return new Promise((resolve) => {
    const onCancel = () => {
      cancelIdleCallback(h);
    };
    const h = requestIdleCallback(() => {
      ac?.signal.removeEventListener("abort", onCancel);
      resolve(fn());
    });
    ac?.signal.addEventListener("abort", onCancel);
  });
}

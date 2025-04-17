/**
 * Concurrently processes items in an array in chunks of 'n' items.
 */
export async function concurrently<T>(
  n: number,
  items: T[],
  fn: (item: T) => Promise<void>
): Promise<void> {
  let i = 0;
  while (i < items.length) {
    const chunk = items.slice(i, i + n);
    await Promise.all(chunk.map(fn));
    i += n;
  }
}

/**
 * Concurrently processes items in an array as fast as possible, but with a
 * maximum of 'n' concurrent items.
 * @param n The maximum number of concurrent items.
 * @param items The items to process.
 * @param fn The function to process each item.
 */
export async function concurrently2<T>(
  n: number,
  items: T[],
  fn: (item: T) => Promise<void>
): Promise<void> {
  const queue: Promise<void>[] = [];

  // Iterate over all items
  for (const item of items) {
    // When the queue reaches the limit 'n', we wait for one of the promises to
    // resolve before adding a new one
    if (queue.length >= n) {
      await Promise.race(queue);
    }

    // Add the new item to the queue and remove it when it's done
    const processing = fn(item).finally(() => {
      // Remove the completed promise from the queue
      const index = queue.indexOf(processing);
      if (index > -1) queue.splice(index, 1);
    });

    // Add the new processing promise to the queue
    queue.push(processing);
  }

  // Wait for all remaining items to complete
  await Promise.all(queue);
}

/**
 * Concurrently processes items in an array as fast as possible, but with a
 * maximum of 'n' concurrent items. Captures the output of the processing
 * function in the same order as the input array.
 * @param n The maximum number of concurrent items.
 * @param items The items to process.
 * @param fn The function to process each item.
 * @returns A promise that resolves with an array of results in the same order as the input.
 */
export async function concurrentlyWithResults<T, U>(
  n: number,
  items: T[],
  fn: (item: T) => Promise<U>
): Promise<U[]> {
  const queue: Promise<void>[] = [];
  const results: U[] = new Array(items.length);

  // Iterate over all items
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;

    // When the queue reaches the limit 'n', we wait for one of the promises to
    // resolve before adding a new one
    if (queue.length >= n) {
      await Promise.race(queue);
    }

    // Add the new item to the queue and remove it when it's done
    const processing = fn(item)
      .then((result) => {
        results[i] = result; // Store the result in the correct index
      })
      .finally(() => {
        // Remove the completed promise from the queue
        const index = queue.indexOf(processing);
        if (index > -1) queue.splice(index, 1);
      });

    // Add the new processing promise to the queue
    queue.push(processing);
  }

  // Wait for all remaining items to complete
  await Promise.all(queue);

  return results;
}

/**
 * Processes items in chunks of specified size, sequentially.
 * @param chunkSize The number of items to process in each chunk
 * @param items The items to process
 * @param fn The function to process each item
 * @returns A promise that resolves with an array of results in the same order as the input
 */
export async function processInChunks<T, U>(
  chunkSize: number,
  items: T[],
  fn: (item: T[]) => Promise<U[]>
): Promise<U[]> {
  const results: U[] = [];

  // Process items in chunks
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const chunkResults = await fn(chunk);
    results.push(...chunkResults);
  }

  return results;
}


/**
 * Processes items in chunks of specified size, sequentially.
 * @param chunkSize The number of items to process in each chunk
 * @param items The items to process
 * @param fn The function to process each item
 */
export async function processInChunks_<T>(
  chunkSize: number,
  items: T[],
  fn: (item: T[]) => Promise<void>
): Promise<void> {
  // Process items in chunks
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    if (chunk.length === 0) break;
    await fn(chunk);
  }
}


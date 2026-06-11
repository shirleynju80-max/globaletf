export async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }));

  return results;
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs?: number): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return promise;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1] = {},
  timeoutMs?: number
): Promise<Response> {
  if (!timeoutMs || timeoutMs <= 0) return fetchImpl(input, init);

  const controller = new AbortController();
  const timeoutError = new Error(`Request timed out after ${timeoutMs}ms`);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const signal = mergeSignals(init.signal, controller.signal);

  try {
    return await Promise.race([
      fetchImpl(input, { ...init, signal }),
      new Promise<Response>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
          controller.abort(timeoutError);
          reject(timeoutError);
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function mergeSignals(existing: AbortSignal | null | undefined, timeoutSignal: AbortSignal): AbortSignal {
  if (!existing) return timeoutSignal;
  if (existing.aborted) return existing;

  const controller = new AbortController();
  const abortFromExisting = () => controller.abort(existing.reason);
  const abortFromTimeout = () => controller.abort(timeoutSignal.reason);
  existing.addEventListener("abort", abortFromExisting, { once: true });
  timeoutSignal.addEventListener("abort", abortFromTimeout, { once: true });

  return controller.signal;
}

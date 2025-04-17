// AbortSignal.any polyfill
(AbortSignal as any).any = (signals: AbortSignal[]) => {
  const ac = new AbortController();
  const onAbort = () => {
    ac.abort();
  };
  for (const signal of signals) {
    if (signal.aborted) {
      ac.abort();
    }
    signal.addEventListener("abort", onAbort);
  }
  return ac.signal;
};

// AbortSignal.prototype.throwIfAborted polyfill
AbortSignal.prototype.throwIfAborted = function () {
  if (this.aborted) {
    throw this.reason;
  }
};

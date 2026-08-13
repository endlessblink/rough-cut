/** Serialize embedded-editor writes per project and make retries idempotent. */
export function createFreecutCommandQueue({ maxReceipts = 256 } = {}) {
  const tails = new Map();
  const receipts = new Map();

  function trimReceipts() {
    while (receipts.size > maxReceipts) {
      const oldest = receipts.keys().next().value;
      if (oldest === undefined) break;
      receipts.delete(oldest);
    }
  }

  return {
    enqueue({ projectId, opId, run }) {
      if (typeof projectId !== 'string' || typeof opId !== 'string' || typeof run !== 'function') {
        return Promise.reject(new Error('Invalid FreeCut command queue request.'));
      }
      const key = `${projectId}:${opId}`;
      const existing = receipts.get(key);
      if (existing) return existing;
      const previous = tails.get(projectId) ?? Promise.resolve();
      const result = previous.catch(() => undefined).then(run);
      tails.set(projectId, result);
      receipts.set(key, result);
      trimReceipts();
      const clearTail = () => {
        if (tails.get(projectId) === result) tails.delete(projectId);
      };
      result.then(clearTail, clearTail);
      return result;
    },
    clear() {
      tails.clear();
      receipts.clear();
    },
  };
}

(function (root) {
  const entries = new Map(),
    metrics = new Map();
  const notify = () => root.dispatchEvent?.(new Event('metlife:operations'));
  async function measure(name, action) {
    const start = performance.now();
    try {
      return await action();
    } finally {
      const previous = metrics.get(name) || { count: 0, total: 0, last: 0, max: 0 };
      const elapsed = performance.now() - start;
      metrics.set(name, {
        count: previous.count + 1,
        total: previous.total + elapsed,
        last: elapsed,
        max: Math.max(previous.max, elapsed),
      });
      notify();
    }
  }
  function run(key, label, action) {
    const old = entries.get(key);
    if (old?.status === 'running') return old.promise;
    const entry = { key, label, status: 'running', retry: () => run(key, label, action) };
    entries.set(key, entry);
    entry.promise = measure(label, action).then(
      (value) => {
        entries.delete(key);
        notify();
        return value;
      },
      (error) => {
        entry.status = 'failed';
        entry.message = error.message;
        notify();
        throw error;
      },
    );
    notify();
    return entry.promise;
  }
  root.metlifeOperations = {
    run,
    measure,
    entries,
    metrics,
    clear: () => {
      entries.clear();
      metrics.clear();
      notify();
    },
  };
  if (root.metlifeState) {
    root.metlifeState.operations = entries;
    root.metlifeState.metrics = metrics;
  }
})(typeof window !== 'undefined' ? window : globalThis);

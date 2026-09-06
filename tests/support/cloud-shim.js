(function () {
  const { select } = window.QAQuery;
  let cached = null;
  const listeners = new Set();
  const read = (tree, path) =>
    path
      .split('/')
      .filter(Boolean)
      .reduce((v, k) => v?.[k], tree) ?? null;
  const snapshot = (value) => ({ val: () => structuredClone(value) });
  const events = new EventSource('/qa/events');
  events.onmessage = (event) => {
    cached = JSON.parse(event.data);
    for (const l of listeners) {
      const value = select(read(cached, l.path), l.q),
        json = JSON.stringify(value);
      if (json !== l.last) {
        l.last = json;
        l.fn(snapshot(value));
      }
    }
  };
  const once = async (path) => {
    const r = await fetch('/qa/value?path=' + encodeURIComponent(path));
    return snapshot(await r.json());
  };
  const send = async (body) => {
    const r = await fetch('/qa/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw Error('write ' + r.status);
    return r.json();
  };
  const db = {
    ref(path = '', q = {}) {
      return {
        orderByKey: () => db.ref(path, { ...q, order: 'key' }),
        orderByChild: (order) => db.ref(path, { ...q, order }),
        equalTo: (equal) => db.ref(path, { ...q, equal }),
        startAt: (start) => db.ref(path, { ...q, start }),
        startAfter: (after, afterKey) => db.ref(path, { ...q, after, afterKey }),
        endAt: (end) => db.ref(path, { ...q, end }),
        limitToFirst: (first) => db.ref(path, { ...q, first }),
        limitToLast: (last) => db.ref(path, { ...q, last }),
        once: async () => snapshot(select((await once(path)).val(), q)),
        on(event, fn) {
          const l = { path, fn, q };
          listeners.add(l);
          if (cached) {
            l.last = JSON.stringify(select(read(cached, path), q));
            queueMicrotask(() => fn(snapshot(select(read(cached, path), q))));
          }
        },
        off(event, fn) {
          for (const l of listeners) if (l.path === path && l.fn === fn) listeners.delete(l);
        },
        set: (value) => send({ operation: 'set', path, value }),
        update: (value) => send({ operation: 'update', path, value }),
        transaction: async (updater) => {
          for (let i = 0; i < 10; i++) {
            const before = (await once(path)).val(),
              next = updater(before);
            if (next === undefined) return { committed: false, snapshot: snapshot(before) };
            const result = await send({ operation: 'transaction', path, value: next, before });
            if (result.committed) return { committed: true, snapshot: snapshot(result.value) };
          }
          throw Error('too many retries');
        },
      };
    },
  };
  const auth = {
    currentUser: { uid: 'qa-user', email: 'qa@example.com' },
    onAuthStateChanged: (fn) => queueMicrotask(() => fn(auth.currentUser)),
    setPersistence: async () => {},
    signInWithEmailAndPassword: async () => {},
    signOut: async () => {
      auth.currentUser = null;
    },
  };
  const app = { auth: () => auth, database: () => db };
  window.firebase = {
    apps: [],
    initializeApp: () => app,
    app: () => app,
    auth: { Auth: { Persistence: { LOCAL: 'local', SESSION: 'session' } } },
  };
})();

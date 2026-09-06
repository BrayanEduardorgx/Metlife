/* One in-memory source for capture state. Legacy global names are accessors, not copies. */
(function (root) {
  const initial = {
    batch: new Date().toISOString().slice(0, 10),
    draftDirty: false,
    draftVersion: 0,
    draftBaseRevision: undefined,
    writingDraft: false,
    pendingWorkspace: null,
    activePendingId: null,
    activePendingRevision: null,
    recordsPageSize: 50,
    editingRecord: null,
    fieldSources: {},
    summarySignature: null,
    summaryOpen: false,
    selectedClient: null,
  };
  const state = {
    capture: initial,
    selection: new Set(),
    operations: new Map(),
    metrics: new Map(),
    cloud: null,
  };
  root.metlifeState = state;
  for (const key of Object.keys(initial))
    Object.defineProperty(root, key === 'selectedClient' ? 'metlifeSelectedClient' : key, {
      configurable: true,
      get: () => initial[key],
      set: (value) => {
        initial[key] = value;
      },
    });
  root.metlifeUI = {
    afterRecords: new Set(),
    afterHistory: new Set(),
    filters: new Set(),
    selection: new Set(),
    rowDecorators: new Set(),
  };
})(window);

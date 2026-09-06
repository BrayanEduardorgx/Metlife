interface Window {
  MetlifeContracts: {
    assertClient: typeof import('./contracts').assertClient;
    assertBulkPatch: typeof import('./contracts').assertBulkPatch;
  };
}

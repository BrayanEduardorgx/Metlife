/** @typedef {{_id: string, _batch: string, nombre?: string, poliza?: string, telefono?: string, _revision?: string}} Client */
/** @typedef {{id: string, batch: string, name: string, recordCount: number}} Archive */
/** @typedef {'admin'|'editor'|'lector'} Role */
/** Validate data entering bulk operations before sending writes.
 * @param {unknown} value
 * @returns {asserts value is Client}
 */
function assertClient(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    !('_id' in value) ||
    typeof value._id !== 'string' ||
    !('_batch' in value) ||
    typeof value._batch !== 'string'
  )
    throw Error('Registro no válido.');
}
/** @param {Record<string, unknown>} patch */
function assertBulkPatch(patch) {
  const allowed = ['vendida', 'comunidad', 'fecha', 'negocio', 'medio', 'trabajo'];
  if (
    !Object.keys(patch).length ||
    Object.entries(patch).some(
      ([key, value]) => !allowed.includes(key) || typeof value !== 'string' || value.length > 4000,
    )
  )
    throw Error('Campo no permitido para edición múltiple.');
}
if (typeof module !== 'undefined') module.exports = { assertClient, assertBulkPatch };
if (typeof window !== 'undefined') window.MetlifeContracts = { assertClient, assertBulkPatch };

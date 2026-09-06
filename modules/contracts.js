/** @typedef {{_id: string, _batch: string, nombre?: string, poliza?: string, telefono?: string, _revision?: string}} Client */
/** @typedef {{id: string, batch: string, name: string, recordCount: number}} Archive */
/** @typedef {'admin'|'editor'|'capturista'|'lector'} Role */
/** Validate data entering bulk operations before sending writes.
 * @param {unknown} value
 * @returns {asserts value is Client}
 */
function assertClient(value) {
  if (!value || typeof value !== 'object' || !('_id' in value) || typeof value._id !== 'string' || !('_batch' in value) || typeof value._batch !== 'string') throw Error('Registro no válido.');
}
if (typeof module !== 'undefined') module.exports = {assertClient};

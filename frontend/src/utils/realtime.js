// Shared helpers for applying realtime socket updates to component state with
// duplicate protection (sockets can reconnect; components can remount).

/**
 * Upsert `item` into `list` keyed by `key` (stable identifier like alert_code).
 * - if a record with the same key exists: replace it (position preserved)
 * - otherwise: prepend the new record (newest first)
 * Returns a new array (immutable), never mutates input.
 */
export function upsertByKey(list, item, key = "id") {
  const next = [...(list || [])];
  const idx = next.findIndex((r) => r && r[key] === item?.[key]);
  if (idx >= 0) {
    next[idx] = item;
  } else {
    next.unshift(item);
  }
  return next;
}

/**
 * Update a single field of an existing record by key, leaving the rest intact.
 * Returns the same list if the record (or key) does not exist.
 */
export function patchByKey(list, key, value, updates) {
  return (list || []).map((r) =>
    r[key] === value ? { ...r, ...updates } : r
  );
}
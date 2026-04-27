type Entry<T> = { value: T; expiresAt: number };

const store = new Map<string, Entry<unknown>>();

function sweepExpired(now: number) {
  for (const [k, v] of store) {
    if (v.expiresAt <= now) store.delete(k);
  }
}

export async function withCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  opts?: { bypass?: boolean }
): Promise<T> {
  const now = Date.now();

  if (!opts?.bypass) {
    const hit = store.get(key) as Entry<T> | undefined;
    if (hit && hit.expiresAt > now) return hit.value;
  }

  const value = await loader();
  store.set(key, { value, expiresAt: now + ttlMs });

  // Opportunistic cleanup to keep the map small in dev / long-lived servers.
  if (store.size > 200) sweepExpired(now);

  return value;
}

export function invalidate(keyPrefix?: string) {
  if (!keyPrefix) {
    store.clear();
    return;
  }
  for (const k of store.keys()) {
    if (k.startsWith(keyPrefix)) store.delete(k);
  }
}

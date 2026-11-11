/** Browser storage durability — PRJ-05 (docs/03 § 6). */

export interface StorageStatus {
  persisted: boolean;
  usageBytes?: number;
  quotaBytes?: number;
}

export async function getStorageStatus(): Promise<StorageStatus> {
  const storage = globalThis.navigator?.storage;
  if (!storage) return { persisted: false };
  const [persisted, estimate] = await Promise.all([
    storage.persisted?.() ?? Promise.resolve(false),
    storage.estimate?.() ?? Promise.resolve(undefined),
  ]);
  return {
    persisted,
    ...(estimate?.usage !== undefined ? { usageBytes: estimate.usage } : {}),
    ...(estimate?.quota !== undefined ? { quotaBytes: estimate.quota } : {}),
  };
}

/** Asks the browser to keep our data under storage pressure. Returns the resulting state. */
export async function requestPersistence(): Promise<boolean> {
  return (await globalThis.navigator?.storage?.persist?.()) ?? false;
}

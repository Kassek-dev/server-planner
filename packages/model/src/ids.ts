/** ID prefixes per entity type — docs/02-model-danych.md § 1 (Prefiksy ID). */
export const ID_PREFIXES = {
  project: 'prj',
  device: 'dev',
  interface: 'if',
  link: 'lnk',
  storagePool: 'pool',
  disk: 'dsk',
  workload: 'wl',
  dockerNetwork: 'dnet',
  stack: 'stk',
  app: 'app',
  snapshot: 'snap',
  vlan: 'vln',
  subnet: 'sub',
  zone: 'zon',
  firewallRule: 'fwr',
  natRule: 'nat',
  route: 'rte',
  tag: 'tag',
  note: 'note',
  assertion: 'asr',
  location: 'loc',
} as const;

export type EntityType = keyof typeof ID_PREFIXES;
export type IdPrefix = (typeof ID_PREFIXES)[EntityType];

/** Web Crypto exists in browsers, workers and Node; the model package has no DOM/Node typings. */
const webCrypto = () => (globalThis as unknown as { crypto: { randomUUID(): string } }).crypto;

const ID_PATTERN = /^([a-z]+)_([A-Za-z0-9-]+)$/;

/** Creates a new random ID for the given entity type, e.g. `dev_3f9c…`. */
export function createId<T extends EntityType>(type: T): `${(typeof ID_PREFIXES)[T]}_${string}` {
  const random = webCrypto().randomUUID().replaceAll('-', '').slice(0, 12);
  return `${ID_PREFIXES[type]}_${random}`;
}

/** Returns the entity type encoded in an ID, or `undefined` for unknown prefixes. */
export function entityTypeOf(id: string): EntityType | undefined {
  const prefix = ID_PATTERN.exec(id)?.[1];
  if (!prefix) return undefined;
  return (Object.keys(ID_PREFIXES) as EntityType[]).find((type) => ID_PREFIXES[type] === prefix);
}

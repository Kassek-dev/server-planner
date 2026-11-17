import type { AddInCard, Expansion } from '../schema/hardware';
import type { Interface } from '../schema/network';
import { removeInterface } from './cascade';
import { applyChanges, CommandError, defineCommand, getOrThrow } from './core';

/**
 * LIB-05 configurator: expansion slots of a device and the add-in cards in them. A NIC card adds
 * its own ports (named after the card position, e.g. `card1p0`), which go away with the card.
 */

export interface NewCard {
  kind: AddInCard['kind'];
  model: string;
  slot: AddInCard['slot'];
  /** NIC: ports the card adds. */
  ports?: { count: number; kind: Interface['kind']; speedMbps?: number };
}

/** Most ports one card may add. */
export const MAX_CARD_PORTS = 8;

export const setExpansion = defineCommand(
  'device.setExpansion',
  (draft, { id, expansion }: { id: string; expansion: Expansion | undefined }) => {
    const device = getOrThrow(draft.devices, id, 'device');
    if (expansion && Object.values(expansion).some((v) => v !== undefined))
      device.hardware.expansion = { ...expansion };
    else delete device.hardware.expansion;
  },
);

export const addCard = defineCommand(
  'device.addCard',
  (draft, { deviceId, card }: { deviceId: string; card: NewCard }, ctx): string => {
    const device = getOrThrow(draft.devices, deviceId, 'device');
    const model = card.model.trim();
    if (!model) throw new CommandError('CARD_MODEL_REQUIRED', {});
    const count = card.kind === 'nic' ? (card.ports?.count ?? 0) : 0;
    if (!Number.isInteger(count) || count < 0 || count > MAX_CARD_PORTS)
      throw new CommandError('CARD_PORTS_INVALID', { max: MAX_CARD_PORTS });
    device.hardware.cards ??= [];
    const cards = device.hardware.cards;
    const position = cards.length + 1;
    const taken = new Set(
      Object.values(draft.interfaces)
        .filter((i) => i.owner.type === 'device' && i.owner.id === deviceId)
        .map((i) => i.name),
    );
    const maxIndex = Math.max(
      -1,
      ...Object.values(draft.interfaces)
        .filter((i) => i.owner.type === 'device' && i.owner.id === deviceId)
        .map((i) => i.index ?? -1),
    );
    const interfaceIds: string[] = [];
    for (let port = 0; port < count; port += 1) {
      let name = `card${position}p${port}`;
      for (let n = 2; taken.has(name); n += 1) name = `card${position}p${port}-${n}`;
      taken.add(name);
      const ifaceId = ctx.createId('interface');
      draft.interfaces[ifaceId] = {
        id: ifaceId,
        owner: { type: 'device', id: deviceId },
        name,
        kind: card.ports?.kind ?? 'rj45',
        index: maxIndex + 1 + port,
        ...(card.ports?.speedMbps ? { speedMbps: card.ports.speedMbps } : {}),
        addresses: [],
        enabled: true,
      };
      interfaceIds.push(ifaceId);
    }
    const id = ctx.createId('card');
    cards.push({ id, kind: card.kind, model, slot: card.slot, interfaceIds });
    return id;
  },
);

export const updateCard = defineCommand(
  'device.updateCard',
  (
    draft,
    {
      deviceId,
      cardId,
      changes,
    }: {
      deviceId: string;
      cardId: string;
      changes: Partial<Pick<AddInCard, 'model' | 'slot' | 'purchase'>>;
    },
  ) => {
    const device = getOrThrow(draft.devices, deviceId, 'device');
    const card = device.hardware.cards?.find((c) => c.id === cardId);
    if (!card) throw new CommandError('NOT_FOUND', { entity: 'card', id: cardId });
    if (changes.model !== undefined && !changes.model.trim())
      throw new CommandError('CARD_MODEL_REQUIRED', {});
    applyChanges(card, changes);
  },
);

/** Removes a card with the ports it added (and their cables). */
export const removeCard = defineCommand(
  'device.removeCard',
  (draft, { deviceId, cardId }: { deviceId: string; cardId: string }) => {
    const device = getOrThrow(draft.devices, deviceId, 'device');
    const card = device.hardware.cards?.find((c) => c.id === cardId);
    if (!card) throw new CommandError('NOT_FOUND', { entity: 'card', id: cardId });
    for (const ifaceId of [...card.interfaceIds])
      if (draft.interfaces[ifaceId]) removeInterface(draft, ifaceId);
    device.hardware.cards = (device.hardware.cards ?? []).filter((c) => c.id !== cardId);
    if (device.hardware.cards.length === 0) delete device.hardware.cards;
  },
);

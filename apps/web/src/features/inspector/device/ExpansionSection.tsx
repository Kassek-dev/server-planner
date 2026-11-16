import {
  type AddInCard,
  addCard,
  type Device,
  type Expansion,
  type InterfaceKind,
  MAX_CARD_PORTS,
  type NewCard,
  removeCard,
  setExpansion,
  updateCard,
} from '@server-planner/model';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '../../../app/services';
import { Button } from '../../../ui/Button';
import { Select } from '../../../ui/Select';
import { TextField } from '../../../ui/TextField';
import {
  AddButton,
  Card,
  CommitField,
  Grid,
  intValidator,
  RemoveButton,
  Section,
  useCommand,
} from '../parts';
import { PickFromList } from './HardwareTab';
import { CARD_PRESETS, slotUsage } from './parts';

const SLOTS = ['pcie', 'm2', 'sata'] as const;
const FIELD: Record<(typeof SLOTS)[number], keyof Expansion> = {
  pcie: 'pcieSlots',
  m2: 'm2Slots',
  sata: 'sataBays',
};
const CARD_SLOTS: AddInCard['slot'][] = ['pcie', 'm2', 'usb'];
const CARD_KINDS: AddInCard['kind'][] = ['nic', 'hba', 'other'];
const PORT_KINDS: InterfaceKind[] = ['rj45', 'sfp', 'sfp+', 'sfp28', 'qsfp+'];
const SPEEDS = [1000, 2500, 5000, 10000, 25000, 40000];

/**
 * LIB-05 configurator in the Hardware tab: the slots and bays of the device (from its catalog
 * model or entered), what uses them, and add-in cards — a NIC adds its ports.
 */
export function ExpansionSection({ device }: { device: Device }) {
  const { t } = useTranslation('inspector');
  const run = useCommand();
  const project = useSession((s) => s.project);
  const [adding, setAdding] = useState(false);
  const hw = device.hardware;
  const expansion = hw.expansion ?? {};
  const used = slotUsage(hw);
  const cards = hw.cards ?? [];
  const add = (card: NewCard) => {
    if (run(addCard, { deviceId: device.id, card }) !== undefined) setAdding(false);
  };
  const portName = (id: string) => project?.interfaces[id]?.name ?? '?';

  return (
    <Section
      title={t('hardware.expansion.title')}
      action={
        <AddButton label={t('hardware.expansion.addCard')} onClick={() => setAdding(!adding)} />
      }
    >
      <Grid>
        {SLOTS.map((slot) => {
          const total = expansion[FIELD[slot]];
          return (
            <CommitField
              key={slot}
              label={t(`hardware.expansion.slots.${slot}`)}
              mono
              value={total !== undefined ? String(total) : ''}
              placeholder="—"
              validate={(v) => (v === '' ? null : intValidator(0, 32, t('errors.number'))(v))}
              onCommit={(v) =>
                run(setExpansion, {
                  id: device.id,
                  expansion: { ...expansion, [FIELD[slot]]: v === '' ? undefined : Number(v) },
                })
              }
            />
          );
        })}
      </Grid>
      <p className="m-0 font-mono text-data-sm text-text-secondary">
        {SLOTS.map((slot) => {
          const total = expansion[FIELD[slot]];
          const over = total !== undefined && used[slot] > total;
          return (
            <span key={slot} className={`mr-3 ${over ? 'text-error-text' : ''}`}>
              {t('hardware.expansion.used', {
                slot: t(`hardware.expansion.short.${slot}`),
                used: used[slot],
                total: total ?? '—',
              })}
            </span>
          );
        })}
      </p>
      {adding ? (
        <div className="flex flex-col gap-2 rounded-md border border-dashed border-border-default p-2.5">
          <PickFromList
            label={t('hardware.expansion.pick')}
            options={CARD_PRESETS.map((p) => ({
              value: p.id,
              label: p.card.ports
                ? `${p.card.model} · ${p.card.ports.count}× ${p.card.ports.kind.toUpperCase()}`
                : p.card.model,
            }))}
            onPick={(id) => {
              const preset = CARD_PRESETS.find((p) => p.id === id);
              if (preset) add(preset.card);
            }}
          />
          <CustomCardForm onAdd={add} />
        </div>
      ) : null}
      {cards.length === 0 && !adding ? (
        <p className="m-0 text-body-sm text-text-muted">{t('hardware.expansion.noCards')}</p>
      ) : null}
      {cards.map((card) => (
        <Card key={card.id} label={card.model}>
          <div className="flex items-end gap-2">
            <Grid>
              <CommitField
                label={t('hardware.expansion.model')}
                value={card.model}
                onCommit={(model) =>
                  model &&
                  run(updateCard, { deviceId: device.id, cardId: card.id, changes: { model } })
                }
              />
              <Select
                label={t('hardware.expansion.slot')}
                value={card.slot}
                options={CARD_SLOTS.map((s) => ({
                  value: s,
                  label: t(`hardware.expansion.cardSlot.${s}`),
                }))}
                onChange={(e) =>
                  run(updateCard, {
                    deviceId: device.id,
                    cardId: card.id,
                    changes: { slot: e.target.value as AddInCard['slot'] },
                  })
                }
              />
            </Grid>
            <RemoveButton
              label={t('hardware.expansion.remove', { model: card.model })}
              onClick={() => run(removeCard, { deviceId: device.id, cardId: card.id })}
            />
          </div>
          <span className="text-body-sm text-text-secondary">
            {t(`hardware.expansion.kind.${card.kind}`)}
            {card.interfaceIds.length > 0
              ? ` · ${t('hardware.expansion.ports', { names: card.interfaceIds.map(portName).join(', ') })}`
              : ''}
          </span>
        </Card>
      ))}
    </Section>
  );
}

function CustomCardForm({ onAdd }: { onAdd: (card: NewCard) => void }) {
  const { t } = useTranslation('inspector');
  const [kind, setKind] = useState<AddInCard['kind']>('nic');
  const [model, setModel] = useState('');
  const [slot, setSlot] = useState<AddInCard['slot']>('pcie');
  const [count, setCount] = useState(1);
  const [portKind, setPortKind] = useState<InterfaceKind>('rj45');
  const [speed, setSpeed] = useState(1000);
  return (
    <form
      aria-label={t('hardware.expansion.custom')}
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!model.trim()) return;
        onAdd({
          kind,
          model: model.trim(),
          slot,
          ...(kind === 'nic' ? { ports: { count, kind: portKind, speedMbps: speed } } : {}),
        });
      }}
    >
      <Grid>
        <Select
          label={t('hardware.expansion.cardKind')}
          value={kind}
          options={CARD_KINDS.map((k) => ({ value: k, label: t(`hardware.expansion.kind.${k}`) }))}
          onChange={(e) => setKind(e.target.value as AddInCard['kind'])}
        />
        <Select
          label={t('hardware.expansion.slot')}
          value={slot}
          options={CARD_SLOTS.map((s) => ({
            value: s,
            label: t(`hardware.expansion.cardSlot.${s}`),
          }))}
          onChange={(e) => setSlot(e.target.value as AddInCard['slot'])}
        />
      </Grid>
      <TextField
        label={t('hardware.expansion.model')}
        value={model}
        maxLength={80}
        onChange={(e) => setModel(e.target.value)}
      />
      {kind === 'nic' ? (
        <div className="grid grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)] items-start gap-2">
          <Select
            label={t('hardware.expansion.portCount')}
            mono
            value={String(count)}
            options={Array.from({ length: MAX_CARD_PORTS }, (_, i) => ({
              value: String(i + 1),
              label: `${i + 1}×`,
            }))}
            onChange={(e) => setCount(Number(e.target.value))}
          />
          <Select
            label={t('hardware.expansion.portKind')}
            mono
            value={portKind}
            options={PORT_KINDS.map((k) => ({ value: k, label: k.toUpperCase() }))}
            onChange={(e) => setPortKind(e.target.value as InterfaceKind)}
          />
          <Select
            label={t('hardware.expansion.speed')}
            mono
            value={String(speed)}
            options={SPEEDS.map((s) => ({
              value: String(s),
              label: s >= 1000 ? `${s / 1000}G` : `${s}M`,
            }))}
            onChange={(e) => setSpeed(Number(e.target.value))}
          />
        </div>
      ) : null}
      <Button type="submit" size="sm" disabled={!model.trim()}>
        {t('hardware.expansion.addCustom')}
      </Button>
    </form>
  );
}

import {
  deleteLocation,
  freeUnits,
  type Location,
  type Project,
  updateLocation,
} from '@server-planner/model';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useResults } from '../../store/results';
import { Button } from '../../ui/Button';
import { SegmentBar } from '../../ui/SegmentBar';
import { Select } from '../../ui/Select';
import { useSelection } from '../canvas/selection';
import { RackElevationDialog } from '../rack/RackElevationDialog';
import {
  AddButton,
  CommitField,
  Grid,
  intValidator,
  OpenRow,
  RemoveButton,
  Row,
  Section,
  useCommand,
} from './parts';

/**
 * I-06 Location (docs/05 § 5.6): name, rack size and width, shelves (LOC-05), parent room, unit
 * occupancy, power of the devices inside vs the UPS that protects them (LOC-06), devices.
 */
export function LocationInspector({ project, location }: { project: Project; location: Location }) {
  const { t } = useTranslation('inspector');
  const run = useCommand();
  const power = useResults((s) => s.result?.power);
  const [elevation, setElevation] = useState(false);
  // A room also counts what stands in its racks and shelves.
  const inside = new Set([
    location.id,
    ...Object.values(project.locations)
      .filter((l) => l.parentId === location.id)
      .map((l) => l.id),
  ]);
  const devices = Object.values(project.devices).filter(
    (d) => d.placement && inside.has(d.placement.locationId),
  );
  const rooms = Object.values(project.locations).filter(
    (l) => l.kind === 'room' && l.id !== location.id && l.parentId === undefined,
  );
  const update = (changes: Parameters<typeof updateLocation.run>[1]['changes']) =>
    run(updateLocation, { id: location.id, changes });

  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-title font-semibold">{location.name}</h2>
        <span className="text-text-secondary">{t(`locationKind.${location.kind}`)}</span>
      </div>
      <CommitField
        label={t('location.name')}
        value={location.name}
        onCommit={(name) => name && update({ name })}
      />
      {location.kind !== 'room' ? (
        <Select
          label={t('location.parent')}
          value={location.parentId ?? ''}
          options={[
            { value: '', label: '—' },
            ...rooms.map((r) => ({ value: r.id, label: r.name })),
          ]}
          onChange={(e) => update({ parentId: e.target.value || undefined })}
        />
      ) : null}
      {location.kind === 'rack' ? (
        <>
          <Section title={t('location.rack')}>
            <Grid>
              <CommitField
                label={t('location.units')}
                mono
                value={String(location.units)}
                validate={intValidator(6, 42, t('errors.rackUnits'))}
                onCommit={(v) => update({ units: Number(v) })}
              />
              <Select
                label={t('location.width')}
                mono
                value={location.width}
                options={[
                  { value: '19in', label: '19″' },
                  { value: '10in', label: '10″' },
                ]}
                onChange={(e) => update({ width: e.target.value as '10in' | '19in' })}
              />
            </Grid>
          </Section>
          <Section
            title={t('location.shelves')}
            action={
              <AddButton
                label={t('location.addShelf')}
                onClick={() =>
                  update({ shelves: [...(location.shelves ?? []), { u: 1, units: 1 }] })
                }
              />
            }
          >
            {(location.shelves ?? []).map((shelf, i) => {
              const shelves = location.shelves ?? [];
              const set = (changes: Partial<typeof shelf>) =>
                update({ shelves: shelves.map((s, j) => (j === i ? { ...s, ...changes } : s)) });
              return (
                <div key={`${shelf.u}-${i}`} className="flex items-end gap-2">
                  <Grid>
                    <CommitField
                      label={t('location.shelfU')}
                      mono
                      value={String(shelf.u)}
                      validate={intValidator(1, location.units, t('errors.rackUnits'))}
                      onCommit={(v) => set({ u: Number(v) })}
                    />
                    <CommitField
                      label={t('location.shelfUnits')}
                      mono
                      value={String(shelf.units)}
                      validate={intValidator(1, location.units, t('errors.rackUnits'))}
                      onCommit={(v) => set({ units: Number(v) })}
                    />
                  </Grid>
                  <RemoveButton
                    label={t('actions.remove')}
                    onClick={() => update({ shelves: shelves.filter((_, j) => j !== i) })}
                  />
                </div>
              );
            })}
          </Section>
        </>
      ) : null}
      {location.kind === 'rack' ? (
        <Section
          title={t('location.occupancy')}
          action={
            <Button size="sm" variant="ghost" onClick={() => setElevation(true)}>
              {t('elevation.open')}
            </Button>
          }
        >
          <OccupancyBar
            used={location.units - freeUnits(project, location.id)}
            of={location.units}
            thresholds={project.settings.capacityThresholds}
          />
        </Section>
      ) : null}
      {power && devices.length > 0 ? (
        <PowerSection deviceIds={devices.map((d) => d.id)} power={power} project={project} />
      ) : null}
      {elevation ? (
        <RackElevationDialog
          project={project}
          rackId={location.id}
          onClose={() => setElevation(false)}
        />
      ) : null}
      <Section title={t('location.devices', { count: devices.length })}>
        {devices.map((d) => (
          <OpenRow
            key={d.id}
            badge={d.placement?.u !== undefined ? `U${d.placement.u}` : t(`deviceKind.${d.kind}`)}
            name={d.name}
            {...(power?.devices[d.id]?.source !== 'none' && power?.devices[d.id]
              ? { meta: `${Math.round(power.devices[d.id]?.expectedW ?? 0)} W` }
              : {})}
            onOpen={() => useSelection.getState().set([d.id])}
          />
        ))}
      </Section>
      <Button
        variant="danger"
        onClick={() => {
          run(deleteLocation, { id: location.id });
          useSelection.getState().clear();
        }}
      >
        {t('location.delete')}
      </Button>
    </>
  );
}

function OccupancyBar({
  used,
  of,
  thresholds,
}: {
  used: number;
  of: number;
  thresholds: { warning: number; critical: number };
}) {
  const { t } = useTranslation('inspector');
  const label = t('location.occupied', { used, total: of });
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-mono text-data">{label}</span>
      <SegmentBar
        ratio={of > 0 ? used / of : 0}
        label={label}
        segments={of}
        warning={thresholds.warning}
        critical={thresholds.critical}
      />
    </div>
  );
}

type PowerReport = NonNullable<ReturnType<typeof useResults.getState>['result']>['power'];

/** LOC-06: estimated draw of the devices here and the UPS units that carry them. */
function PowerSection({
  deviceIds,
  power,
  project,
}: {
  deviceIds: string[];
  power: PowerReport;
  project: Project;
}) {
  const { t } = useTranslation('inspector');
  const here = new Set(deviceIds);
  const sum = (key: 'idleW' | 'expectedW') =>
    Math.round(deviceIds.reduce((s, id) => s + (power.devices[id]?.[key] ?? 0), 0));
  const unknown = deviceIds.filter((id) => power.unknown.includes(id)).length;
  const ups = power.ups.filter((u) => u.protected.some((id) => here.has(id)));
  return (
    <Section title={t('location.power')}>
      <Row label={t('location.powerIdle')} value={`${sum('idleW')} W`} />
      <Row label={t('location.powerExpected')} value={`${sum('expectedW')} W`} />
      {unknown > 0 ? (
        <p className="m-0 text-body-sm text-text-muted">
          {t('location.powerUnknown', { count: unknown })}
        </p>
      ) : null}
      {ups.length === 0 ? (
        <p className="m-0 text-body-sm text-text-muted">{t('location.noUps')}</p>
      ) : (
        ups.map((u) => {
          const label = t('location.upsLoad', {
            name: project.devices[u.deviceId]?.name ?? '?',
            load: Math.round(u.loadW),
            capacity: u.capacityW,
          });
          return (
            <div key={u.deviceId} className="flex flex-col gap-1.5">
              <span className="text-body-sm">{label}</span>
              <SegmentBar ratio={u.ratio} label={label} warning={0.7} critical={0.9} />
            </div>
          );
        })
      )}
    </Section>
  );
}

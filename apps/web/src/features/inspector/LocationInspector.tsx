import { deleteLocation, type Location, type Project, updateLocation } from '@server-planner/model';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/Button';
import { Select } from '../../ui/Select';
import { useSelection } from '../canvas/selection';
import {
  AddButton,
  CommitField,
  Grid,
  intValidator,
  RemoveButton,
  Row,
  Section,
  useCommand,
} from './parts';

/** I-06 Location (docs/05 § 5.6): name, rack size and width, shelves (LOC-05), parent room, devices. */
export function LocationInspector({ project, location }: { project: Project; location: Location }) {
  const { t } = useTranslation('inspector');
  const run = useCommand();
  const devices = Object.values(project.devices).filter(
    (d) => d.placement?.locationId === location.id,
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
      <Section title={t('location.devices', { count: devices.length })}>
        {devices.map((d) => (
          <Row
            key={d.id}
            label={d.name}
            value={d.placement?.u !== undefined ? `U${d.placement.u}` : t(`deviceKind.${d.kind}`)}
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

import {
  CommandError,
  type Device,
  type Location,
  nearestFreeU,
  type Project,
  placeDevice,
  unplaceDevice,
  updateDevice,
  updateLocation,
} from '@server-planner/model';
import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useServices, useSession } from '../../app/services';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/TextField';
import { deleteSelection } from '../canvas/actions';
import { devicePorts } from '../canvas/graph';
import { useSelection } from '../canvas/selection';
import { Summary } from '../editor/Summary';

/** Right column (304 px). Stage 3: selection basics (CAN-05); full I-02…I-07 tabs arrive in stage 4. */
export function SelectionPanel() {
  const { t } = useTranslation('canvas');
  const project = useSession((s) => s.project);
  const { nodeIds, edgeIds } = useSelection();
  if (!project) return null;

  const count = nodeIds.length + edgeIds.length;
  let body: ReactNode;
  if (count === 0) body = <Summary project={project} />;
  else if (count > 1) body = <Multi count={count} />;
  else if (nodeIds[0] && project.devices[nodeIds[0]])
    body = <DevicePanel project={project} device={project.devices[nodeIds[0]] as Device} />;
  else if (nodeIds[0] && project.locations[nodeIds[0]])
    body = <LocationPanel project={project} location={project.locations[nodeIds[0]] as Location} />;
  else if (edgeIds[0] && project.links[edgeIds[0]])
    body = <LinkPanel project={project} linkId={edgeIds[0]} />;
  else body = <Summary project={project} />;

  return (
    <aside
      aria-label={t('panel.title')}
      className="flex w-76 shrink-0 flex-col gap-4 overflow-auto border-l border-border-subtle bg-panel p-4"
    >
      {body}
    </aside>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-border-subtle pt-3">
      <h3 className="m-0 font-mono text-label font-semibold tracking-[0.08em] text-text-secondary uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span>{label}</span>
      <span className="text-right font-mono text-data text-text-secondary">{value}</span>
    </div>
  );
}

/** Name field that commits on blur / Enter as one undo step. */
function NameField({ value, onCommit }: { value: string; onCommit: (name: string) => void }) {
  const { t } = useTranslation('canvas');
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    const next = draft.trim();
    if (next && next !== value) onCommit(next);
    else setDraft(value);
  };
  return (
    <TextField
      label={t('panel.name')}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
    />
  );
}

function DeleteButton() {
  const { t } = useTranslation('canvas');
  const { session } = useServices();
  return (
    <Button
      variant="danger"
      onClick={() => {
        const { nodeIds, edgeIds, clear } = useSelection.getState();
        deleteSelection(session, nodeIds, edgeIds);
        clear();
      }}
    >
      {t('panel.delete')}
    </Button>
  );
}

function DevicePanel({ project, device }: { project: Project; device: Device }) {
  const { t } = useTranslation('canvas');
  const { session } = useServices();
  const [error, setError] = useState<string | null>(null);
  const ports = devicePorts(project, device.id);
  const location = device.placement ? project.locations[device.placement.locationId] : undefined;
  const ff = device.formFactor;

  const move = (locationId: string) => {
    setError(null);
    try {
      if (!locationId) {
        session.dispatch(unplaceDevice, { id: device.id, position: { x: 2, y: 2 } });
        return;
      }
      const target = project.locations[locationId];
      if (target?.kind === 'rack') {
        const u = nearestFreeU(project, device.id, locationId, target.units);
        if (u === undefined) {
          setError(
            t('errors.RACK_FULL', {
              units: ff?.mount === 'rack' ? ff.units : 1,
              rack: target.name,
            }),
          );
          return;
        }
        const onShelf = ff?.mount === 'standalone';
        session.dispatch(placeDevice, {
          id: device.id,
          locationId,
          u,
          ...(onShelf ? { onShelf } : {}),
        });
      } else {
        session.dispatch(placeDevice, { id: device.id, locationId });
      }
    } catch (e) {
      if (e instanceof CommandError)
        setError(
          t(`errors.${e.code}`, {
            defaultValue: t('errors.generic', { code: e.code }),
            ...e.params,
          }),
        );
      else throw e;
    }
  };

  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-title font-semibold">{device.name}</h2>
        <span className="text-text-secondary">{t(`deviceKind.${device.kind}`)}</span>
      </div>
      <NameField
        value={device.name}
        onCommit={(name) => session.dispatch(updateDevice, { id: device.id, changes: { name } })}
      />
      <Section title={t('panel.formFactor')}>
        <Row
          label={t('panel.mount')}
          value={
            !ff
              ? '—'
              : ff.mount === 'rack'
                ? `${t('panel.rackMount')} · ${ff.units}U · ${ff.width === '10in' ? '10″' : '19″'}`
                : t(`shape.${ff.shape}`)
          }
        />
      </Section>
      {ff ? (
        <Section title={t('panel.location')}>
          <label className="flex flex-col gap-1.5">
            <span className="sr-only">{t('panel.location')}</span>
            <select
              value={device.placement?.locationId ?? ''}
              onChange={(e) => move(e.target.value)}
              className="h-8 rounded-md border border-border-default bg-inset px-2 text-body text-text-primary"
            >
              <option value="">{t('panel.unplaced')}</option>
              {Object.values(project.locations).map((l) => (
                <option key={l.id} value={l.id}>
                  {`${l.name} · ${t(`locationKind.${l.kind}`)}`}
                </option>
              ))}
            </select>
          </label>
          {location?.kind === 'rack' && device.placement?.u !== undefined ? (
            <Row
              label={t('panel.unit')}
              value={
                device.placement.onShelf
                  ? t('panel.onShelf', { u: device.placement.u })
                  : `U${device.placement.u}`
              }
            />
          ) : null}
          {error ? (
            <span role="alert" className="text-body-sm text-error-text">
              {error}
            </span>
          ) : null}
        </Section>
      ) : null}
      <Section
        title={t('panel.ports', {
          used: ports.filter((p) => p.state !== 'free').length,
          total: ports.length,
        })}
      >
        {ports.map((p) => (
          <Row key={p.id} label={p.name} value={t(`portState.${p.state}`)} />
        ))}
      </Section>
      <p className="m-0 text-body-sm text-text-muted">{t('panel.more')}</p>
      <DeleteButton />
    </>
  );
}

function LocationPanel({ project, location }: { project: Project; location: Location }) {
  const { t } = useTranslation('canvas');
  const { session } = useServices();
  const [error, setError] = useState<string | null>(null);
  const devices = Object.values(project.devices).filter(
    (d) => d.placement?.locationId === location.id,
  );
  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-title font-semibold">{location.name}</h2>
        <span className="text-text-secondary">{t(`locationKind.${location.kind}`)}</span>
      </div>
      <NameField
        value={location.name}
        onCommit={(name) =>
          session.dispatch(updateLocation, { id: location.id, changes: { name } })
        }
      />
      {location.kind === 'rack' ? (
        <Section title={t('panel.rack')}>
          <TextField
            label={t('panel.units')}
            type="number"
            mono
            min={6}
            max={42}
            defaultValue={location.units}
            onBlur={(e) => {
              setError(null);
              const units = Number(e.target.value);
              if (!Number.isInteger(units) || units < 6 || units > 42) {
                setError(t('errors.RACK_UNITS_RANGE'));
                return;
              }
              if (units !== location.units)
                session.dispatch(updateLocation, { id: location.id, changes: { units } });
            }}
            {...(error ? { error } : {})}
          />
          <Row label={t('panel.width')} value={location.width === '10in' ? '10″' : '19″'} />
        </Section>
      ) : null}
      <Section title={t('panel.devices', { count: devices.length })}>
        {devices.map((d) => (
          <Row
            key={d.id}
            label={d.name}
            value={d.placement?.u !== undefined ? `U${d.placement.u}` : t(`deviceKind.${d.kind}`)}
          />
        ))}
      </Section>
      <DeleteButton />
    </>
  );
}

function LinkPanel({ project, linkId }: { project: Project; linkId: string }) {
  const { t } = useTranslation('canvas');
  const link = project.links[linkId];
  if (!link) return null;
  const end = (id: string) => {
    const iface = project.interfaces[id];
    const owner = iface ? project.devices[iface.owner.id] : undefined;
    return `${owner?.name ?? '?'}:${iface?.name ?? '?'}`;
  };
  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-title font-semibold">{t('panel.link')}</h2>
        <span className="font-mono text-data text-text-secondary">{`${end(link.a)} ⇄ ${end(link.b)}`}</span>
      </div>
      <Section title={t('panel.cable')}>
        <Row label={t('panel.medium')} value={t(`medium.${link.medium}`)} />
      </Section>
      <DeleteButton />
    </>
  );
}

function Multi({ count }: { count: number }) {
  const { t } = useTranslation('canvas');
  return (
    <>
      <h2 className="m-0 text-title font-semibold">{t('panel.multi', { count })}</h2>
      <DeleteButton />
    </>
  );
}

import {
  type Device,
  nearestFreeU,
  type Project,
  placeDevice,
  unplaceDevice,
} from '@server-planner/model';
import { useCommand, useInspectorError } from '../parts';

/** Moves a device to a location (rack: nearest free unit, shelf for standalone) or unplaces it. */
export function useMoveDevice() {
  const run = useCommand();
  return (project: Project, device: Device, locationId: string) => {
    if (!locationId) {
      run(unplaceDevice, { id: device.id, position: { x: 2, y: 2 } });
      return;
    }
    const target = project.locations[locationId];
    if (target?.kind !== 'rack') {
      run(placeDevice, { id: device.id, locationId });
      return;
    }
    const u = nearestFreeU(project, device.id, locationId, target.units);
    if (u === undefined) {
      useInspectorError.getState().set({ code: 'RACK_FULL', params: { rack: target.name } });
      return;
    }
    run(placeDevice, {
      id: device.id,
      locationId,
      u,
      ...(device.formFactor?.mount === 'standalone' ? { onShelf: true } : {}),
    });
  };
}

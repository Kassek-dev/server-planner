import { createContext, type ReactNode, useContext } from 'react';
import { useStore } from 'zustand';
import { openAppDb } from '../persistence/db';
import { ProjectRepository } from '../persistence/repository';
import {
  createProjectSession,
  type ProjectSession,
  type ProjectSessionState,
} from '../store/projectSession';

/** App-wide services (storage + editing session), created once at startup. */
export interface AppServices {
  repository: ProjectRepository;
  session: ProjectSession;
}

export async function createServices(dbName?: string): Promise<AppServices> {
  const repository = new ProjectRepository(await openAppDb(dbName));
  const session = createProjectSession({ repository });
  return { repository, session };
}

const ServicesContext = createContext<AppServices | null>(null);

export function ServicesProvider({
  services,
  children,
}: {
  services: AppServices;
  children: ReactNode;
}) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): AppServices {
  const services = useContext(ServicesContext);
  if (!services) throw new Error('ServicesProvider missing');
  return services;
}

export function useSession<T>(selector: (state: ProjectSessionState) => T): T {
  return useStore(useServices().session, selector);
}

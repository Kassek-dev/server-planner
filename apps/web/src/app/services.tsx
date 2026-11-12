import { createContext, type ReactNode, useContext } from 'react';
import { useStore } from 'zustand';
import { openAppDb } from '../persistence/db';
import { ProjectRepository } from '../persistence/repository';
import {
  createProjectSession,
  type ProjectSession,
  type ProjectSessionState,
} from '../store/projectSession';
import { createAnalyzer, createSimulator, type Simulator } from '../store/results';

/** App-wide services (storage + editing session), created once at startup. */
export interface AppServices {
  repository: ProjectRepository;
  session: ProjectSession;
  /** Engine runner (Web Worker in the browser). */
  analyzer: ReturnType<typeof createAnalyzer>;
  /** Simulation queries (same worker). */
  simulator: Simulator;
}

export async function createServices(dbName?: string): Promise<AppServices> {
  const repository = new ProjectRepository(await openAppDb(dbName));
  const session = createProjectSession({ repository });
  return { repository, session, analyzer: createAnalyzer(), simulator: createSimulator() };
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

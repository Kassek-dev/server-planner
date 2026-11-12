import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { FetchContext } from './sources/types';

export const USER_AGENT =
  'server-planner-catalog/1.1 (+https://github.com/Kassek-dev/server-planner)';

export class BudgetExceeded extends Error {}

/** Polite HTTP for one source: identifying User-Agent, timeout, two retries, request budget. */
export function createFetchContext(
  workDir: string,
  budget: number,
  { timeoutMs = 120_000, fetchImpl = fetch }: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): FetchContext {
  let used = 0;
  const get = async (url: string): Promise<Response> => {
    if (!url.startsWith('https://')) throw new Error(`Only https sources are allowed: ${url}`);
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (used >= budget) throw new BudgetExceeded(`Request budget of ${budget} used up`);
      used += 1;
      try {
        const response = await fetchImpl(url, {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (response.ok) return response;
        lastError = new Error(`${url}: HTTP ${response.status}`);
        if (response.status < 500 && response.status !== 429) break;
      } catch (error) {
        lastError = error;
      }
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  };
  return {
    workDir,
    get,
    async download(url, fileName) {
      await mkdir(workDir, { recursive: true });
      const response = await get(url);
      if (!response.body) throw new Error(`${url}: empty body`);
      const path = join(workDir, fileName);
      await pipeline(Readable.fromWeb(response.body as never), createWriteStream(path));
      return path;
    },
  };
}

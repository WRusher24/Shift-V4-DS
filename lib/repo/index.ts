/**
 * Repository factory.
 *
 * Selection rules, in order:
 *   1. `SHIFT_FORCE_LOCAL_STORE=true`  -> LocalRepository (explicit opt-in)
 *   2. `DATABASE_URL` present          -> DrizzleRepository (Neon PostgreSQL)
 *   3. otherwise                       -> LocalRepository (zero-config default)
 *
 * The instance is memoised on `globalThis` so the JSON store is not reloaded
 * from disk on every hot reload, and so a single connection pool is shared
 * across route handlers within the same process.
 */

import type { Repository } from '@/lib/repo/types';
import { LocalRepository } from '@/lib/repo/local-repository';
import { DrizzleRepository } from '@/lib/repo/drizzle-repository';
import { isDatabaseConfigured } from '@/lib/db';

interface RepoGlobal {
  __shiftRepo?: Repository;
  __shiftRepoKind?: string;
}

const globals = globalThis as unknown as RepoGlobal;

export function shouldUseLocalStore(): boolean {
  if (process.env.SHIFT_FORCE_LOCAL_STORE?.trim().toLowerCase() === 'true') return true;
  return !isDatabaseConfigured();
}

export function getRepository(): Repository {
  const kind = shouldUseLocalStore() ? 'local' : 'drizzle';

  if (globals.__shiftRepo && globals.__shiftRepoKind === kind) {
    return globals.__shiftRepo;
  }

  const repository: Repository = kind === 'local' ? new LocalRepository() : new DrizzleRepository();

  if (kind === 'local') {
    console.warn(
      '[shift] Running on the local JSON store. This is intended for development and demos — ' +
        'set DATABASE_URL to use Neon PostgreSQL.',
    );
  }

  globals.__shiftRepo = repository;
  globals.__shiftRepoKind = kind;
  return repository;
}

export type { Repository };

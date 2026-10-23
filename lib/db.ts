import { Pool } from "pg"

// Reuse a single Pool across HMR reloads so we don't exhaust Neon connections.
const globalForPg = globalThis as unknown as { _arenaPool?: Pool }

export const pool =
  globalForPg._arenaPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30_000,
  })

if (!globalForPg._arenaPool) globalForPg._arenaPool = pool

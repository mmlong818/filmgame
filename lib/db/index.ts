import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema'

const globalForDb = globalThis as unknown as { __filmgamePool?: Pool }

function createPool(): Pool {
  return new Pool({
    connectionString:
      process.env.DATABASE_URL ?? 'postgres://filmgame:filmgame@localhost:5432/filmgame',
    max: 10,
  })
}

// globalThis 缓存防止 Next 热重载时连接泄漏
export const pool = globalForDb.__filmgamePool ?? createPool()
if (process.env.NODE_ENV !== 'production') globalForDb.__filmgamePool = pool

export const db = drizzle(pool, { schema })

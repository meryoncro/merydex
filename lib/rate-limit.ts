import { pool } from "@/lib/db"

export interface RateResult {
  allowed: boolean
  retryAfter: number
}

/**
 * Fixed-window counter stored in Postgres so limits hold across every
 * serverless instance (an in-memory Map would reset per instance).
 * One atomic upsert per request: it either increments the current window or
 * starts a new one.
 */
export async function rateLimit(bucket: string, limit: number, windowSeconds: number): Promise<RateResult> {
  try {
    const { rows } = await pool.query<{ hits: number; age: number }>(
      `INSERT INTO merydex_rate_limits (bucket, window_start, hits)
       VALUES ($1, now(), 1)
       ON CONFLICT (bucket) DO UPDATE SET
         hits = CASE WHEN merydex_rate_limits.window_start < now() - make_interval(secs => $2)
                     THEN 1 ELSE merydex_rate_limits.hits + 1 END,
         window_start = CASE WHEN merydex_rate_limits.window_start < now() - make_interval(secs => $2)
                     THEN now() ELSE merydex_rate_limits.window_start END
       RETURNING hits, EXTRACT(EPOCH FROM (now() - window_start))::int AS age`,
      [bucket.slice(0, 200), windowSeconds],
    )

    if (Math.random() < 0.01) {
      pool.query(`DELETE FROM merydex_rate_limits WHERE window_start < now() - interval '1 hour'`).catch(() => {})
    }

    const { hits, age } = rows[0]
    return { allowed: hits <= limit, retryAfter: Math.max(1, windowSeconds - age) }
  } catch {
    // Fail open: a database hiccup must not take the whole API offline.
    return { allowed: true, retryAfter: 0 }
  }
}

import { Pool } from "pg";

// Step 3 talks to Postgres directly through the Supabase connection pooler.
// There is no auth yet, so there is no RLS context: queries are scoped to the
// RSG organisation in SQL. Step 4 replaces this with the Supabase auth client
// whose queries run under the calling user's row-level security.
//
// Server-only. Never import from a client component.

declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
}

function makePool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "Missing DATABASE_URL. Copy .env.local.example to .env.local and set it to the Supabase pooler connection string (Project Settings -> Database -> Connection string -> Transaction/Session pooler).",
    );
  }
  return new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 4,
  });
}

// Reuse one pool across hot reloads in dev.
export const pool: Pool = global._pgPool ?? makePool();
if (process.env.NODE_ENV !== "production") global._pgPool = pool;

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await pool.query(text, params as never[]);
  return result.rows as T[];
}

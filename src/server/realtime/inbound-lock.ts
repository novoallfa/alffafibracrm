import { Client } from "pg";

// Transaction-scoped lock also works through transaction poolers. Separate callers
// cannot read and overwrite the same conversation state while a reply is generated.
export async function withInboundLock<T>(phone: string, work: () => Promise<T>): Promise<T> {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  let lastLockError: unknown;

  // A reply can include an AI request and a Z-API request. When a customer sends
  // messages in quick succession, wait for the first one instead of dropping the
  // second webhook after the former eight-second timeout.
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const client = new Client({ connectionString, connectionTimeoutMillis: 5000,
      ssl: connectionString?.startsWith("postgres") ? { rejectUnauthorized: false } : undefined });
    let connectionError: Error | null = null;
    client.on("error", (error) => { connectionError = error; });
    try {
      await client.connect();
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '45s'");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`chatbot:${phone}`]);
      const result = await work();
      if (connectionError) throw connectionError;
      await client.query("COMMIT");
      return result;
    } catch (error) {
      lastLockError = error;
      if (!isLockTimeout(error) || attempt === 2) throw error;
      await wait(750);
    } finally {
      // Closing the connection rolls back on failure and releases the lock.
      await client.end().catch(() => {});
    }
  }

  throw lastLockError;
}

function isLockTimeout(error: unknown) {
  return error instanceof Error && error.message.includes("lock timeout");
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

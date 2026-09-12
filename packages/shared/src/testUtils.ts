import type { SupabaseClient } from "@supabase/supabase-js";

interface MockResponse {
  data: unknown;
  error: { code: string; message: string } | null;
}

/**
 * A minimal fake Supabase query builder for unit tests. Each call to
 * `.from(table)` pops the next queued response for that table (in call
 * order), regardless of which chain methods (`select`, `eq`, `ilike`, ...)
 * are used — these tests exercise our tool logic against known Supabase
 * *responses*, not Supabase's own query building.
 */
export function createMockSupabaseClient(responsesByTable: Record<string, MockResponse[]>): SupabaseClient {
  const cursors: Record<string, number> = {};

  const client = {
    from(table: string) {
      const idx = cursors[table] ?? 0;
      cursors[table] = idx + 1;
      const queue = responsesByTable[table] ?? [];
      const response = queue[idx] ?? { data: null, error: null };

      const chainMethods = ["select", "eq", "ilike", "lte", "or", "insert", "update", "delete", "order", "limit"];
      const chain: Record<string, unknown> = {};
      for (const method of chainMethods) {
        chain[method] = () => chain;
      }
      chain.maybeSingle = () => Promise.resolve(response);
      chain.single = () => Promise.resolve(response);
      chain.then = (onFulfilled: (v: MockResponse) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve(response).then(onFulfilled, onRejected);
      return chain;
    },
  };

  return client as unknown as SupabaseClient;
}

export function ok(data: unknown): MockResponse {
  return { data, error: null };
}

export function dbError(code = "500", message = "db error"): MockResponse {
  return { data: null, error: { code, message } };
}

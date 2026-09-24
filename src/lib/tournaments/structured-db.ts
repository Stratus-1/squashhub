import { supabase } from "@/integrations/supabase/client";
import type { CommitOp, Db } from "./structured-persist";

const from = (t: string) => (supabase as any).from(t);

/** Supabase-backed Db for the structured engine. RLS + DB identity triggers still apply. */
export const supabaseDb: Db = {
  async insert(table, rows) {
    const { data, error } = await from(table).insert(rows).select("*");
    if (error) throw new Error(`${table}: ${error.message}`);
    return data ?? [];
  },
  async select(table, filter) {
    let q = from(table).select("*");
    for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    return data ?? [];
  },
  async update(table, filter, patch) {
    let q = from(table).update(patch);
    for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
    const { error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
  },
};

/** One server transaction: all structure, rounds and games are saved together or not at all. */
export async function commitStructured(tid: string, ops: CommitOp[]) {
  const { data, error } = await (supabase as any).rpc("structured_commit", { p_tid: tid, p_ops: ops });
  if (error) throw new Error(error.message);
  return data;
}

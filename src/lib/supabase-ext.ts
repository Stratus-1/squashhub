/**
 * Untyped Supabase helpers for tables / RPCs that exist in the external
 * Supabase project but are NOT reflected in the generated types file
 * (src/integrations/supabase/types.ts).
 *
 * Usage:
 *   import { fromExt, rpcExt } from "@/lib/supabase-ext";
 *   const { data } = await fromExt("my_table").select("*");
 *   const { data } = await rpcExt("my_function", { arg: 1 });
 */
import { supabase } from "@/integrations/supabase/client";

/** Query a table that may not be in the generated types. */
export const fromExt = (table: string) => (supabase as any).from(table);

/** Call an RPC that may not be in the generated types. */
export const rpcExt: any = supabase.rpc.bind(supabase);

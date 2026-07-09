import { supabase } from "@/integrations/supabase/client";

export type JournalLine = {
  account: string;
  debit?: number;
  credit?: number;
  description?: string;
  member_id?: string | null;
  payment_id?: string | null;
};

/**
 * Canonical client wrapper for the `post_journal` DB RPC.
 * The DB function refuses to insert unbalanced entries, so all finance
 * postings MUST go through this helper — never insert into
 * `club_journal_entries` directly from the client.
 *
 * Returns the journal_ref used for the batch (auto-generated server-side
 * unless `ref` is supplied).
 */
export async function postJournal(
  clubId: string,
  lines: JournalLine[],
  opts: { ref?: string; description?: string } = {},
): Promise<string> {
  const payload = lines.map((l) => ({
    account: l.account,
    debit: Number(l.debit || 0),
    credit: Number(l.credit || 0),
    description: l.description ?? null,
    member_id: l.member_id ?? null,
    payment_id: l.payment_id ?? null,
  }));

  const rpcArgs: Record<string, unknown> = {
    p_club_id: clubId,
    p_lines: payload,
    p_description: opts.description ?? null,
  };
  // Only pass p_ref when supplied — otherwise let the DB default (gen_random_uuid())
  // apply. Passing null would violate the NOT NULL journal_ref column.
  if (opts.ref) rpcArgs.p_ref = opts.ref;
  const { data, error } = await (supabase as any).rpc("post_journal", rpcArgs);
  if (error) throw error;
  return data as string;
}

// Finalise every bar sale line that shares one online payment reference.
// Used by bar-card-verify (Stitch/Yoco polling) and payfast-itn (PayFast
// notifications) so tab settlement behaves the same whichever gateway paid.
// Idempotent: only rows not already in the target state are touched.
export async function finaliseBarReference(
  admin: any,
  clubId: string,
  reference: string,
  next: "paid" | "failed" | "pending",
) {
  if (next === "pending") return;
  const { data: refRows } = await admin
    .from("bar_visitor_sales")
    .select("id, guest_tab_id, payment_status")
    .eq("club_id", clubId)
    .eq("payment_reference", reference);
  const rows = (refRows || []) as Array<{ id: string; guest_tab_id: string | null; payment_status: string }>;
  if (!rows.length || rows.every((r) => r.payment_status === next)) return;
  const tabIds = [...new Set(rows.map((r) => r.guest_tab_id).filter(Boolean))] as string[];

  if (next === "failed" && tabIds.length) {
    // A failed tab settlement goes back onto the open tab so the guest can retry.
    await admin.from("bar_visitor_sales")
      .update({ payment_method: "tab", payment_status: "on_tab", note: "Open bar tab", payment_reference: null })
      .eq("club_id", clubId)
      .eq("payment_reference", reference)
      .neq("payment_status", "paid");
    await admin.from("bar_guest_tabs")
      .update({ status: "open", settled_method: null })
      .in("id", tabIds)
      .neq("status", "settled");
    return;
  }

  await admin.from("bar_visitor_sales")
    .update({ payment_status: next })
    .eq("club_id", clubId)
    .eq("payment_reference", reference)
    .neq("payment_status", "paid");
  if (next === "paid" && tabIds.length) {
    await admin.from("bar_guest_tabs")
      .update({ status: "settled", closed_at: new Date().toISOString(), settled_method: "online" })
      .in("id", tabIds);
  }
}

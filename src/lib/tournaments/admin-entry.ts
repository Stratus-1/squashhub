/**
 * An entry the organiser created on the player's behalf (admin-selected,
 * admin-paired). Such players are informed, not invited: their screens show
 * the existing entry and payment only — never "Enter", group entry or a
 * partner picker that could create a second registration.
 */
export function isAdminEnteredRegistration(reg: any): boolean {
  if (!reg) return false;
  const status = String(reg.status ?? "").toLowerCase();
  if (["cancelled", "withdrawn", "declined"].includes(status)) return false;
  return (
    reg.invited_by_admin === true &&
    (reg.registration_source === "admin" || reg.confirmation_source === "admin")
  );
}

/**
 * Birth dates accepted from the junior reminder link: a real calendar date
 * making the player 3–25 years old today. Mirrors `junior_dob_submit`, which
 * is the authority; this only gives instant feedback on the form.
 */
export function isAcceptableJuniorBirthDate(value: string, today: Date = new Date()): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dob = new Date(Date.UTC(y, mo - 1, d));
  if (dob.getUTCFullYear() !== y || dob.getUTCMonth() !== mo - 1 || dob.getUTCDate() !== d) return false;
  const t = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const youngest = new Date(Date.UTC(t.getUTCFullYear() - 3, t.getUTCMonth(), t.getUTCDate()));
  const oldest = new Date(Date.UTC(t.getUTCFullYear() - 25, t.getUTCMonth(), t.getUTCDate()));
  return dob <= youngest && dob >= oldest;
}

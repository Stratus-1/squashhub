export const SA_PROVINCES = [
  "Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo",
  "Mpumalanga", "North West", "Northern Cape", "Western Cape",
] as const;

/** Province named in a free-text location (e.g. "Witbank, Mpumalanga"); null when none is named. */
export function provinceOf(location: string | null | undefined): string | null {
  const l = (location || "").toLowerCase().replace(/[-\s]+/g, " ");
  // Check "Northern Cape" / "North West" before shorter names that could overlap.
  const order = ["Northern Cape", "North West", "Eastern Cape", "Western Cape", "KwaZulu-Natal", "Free State", "Gauteng", "Limpopo", "Mpumalanga"];
  for (const p of order) {
    if (l.includes(p.toLowerCase().replace(/[-\s]+/g, " "))) return p;
  }
  if (/\bkzn\b/.test(l)) return "KwaZulu-Natal";
  return null;
}

/** Decimal degrees → degrees / decimal-minutes and degrees-minutes-seconds. */

function parts(dec: number) {
  const abs = Math.abs(dec);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = (minFloat - min) * 60;
  return { deg, min, minFloat, sec };
}

/** e.g. 34° 05.508' S */
export function toDegreesMinutes(dec: number, axis: "lat" | "lng"): string {
  if (!Number.isFinite(dec)) return "—";
  const { deg, minFloat } = parts(dec);
  const hemi = axis === "lat" ? (dec < 0 ? "S" : "N") : dec < 0 ? "W" : "E";
  return `${deg}° ${minFloat.toFixed(3).padStart(6, "0")}' ${hemi}`;
}

/** e.g. 34° 05' 30.5" S */
export function toDMS(dec: number, axis: "lat" | "lng"): string {
  if (!Number.isFinite(dec)) return "—";
  const { deg, min, sec } = parts(dec);
  const hemi = axis === "lat" ? (dec < 0 ? "S" : "N") : dec < 0 ? "W" : "E";
  return `${deg}° ${String(min).padStart(2, "0")}' ${sec.toFixed(1).padStart(4, "0")}" ${hemi}`;
}

/** Both coordinates in degrees + decimal minutes. */
export function formatLatLngDM(lat: number, lng: number): string {
  return `${toDegreesMinutes(lat, "lat")}  ${toDegreesMinutes(lng, "lng")}`;
}

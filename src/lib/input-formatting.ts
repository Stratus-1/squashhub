/**
 * Input formatting and validation utilities for consistent data entry.
 */

/**
 * Convert a string to title case (first letter of each word capitalised).
 * Handles common name particles like "van", "de", "du", "den", "der" in lowercase
 * unless they appear at the start.
 */
const LOWERCASE_PARTICLES = new Set(["van", "de", "du", "den", "der", "von", "le", "la", "di"]);

export function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .map((word, idx) => {
      if (!word) return word;
      const lower = word.toLowerCase();
      // Keep particles lowercase unless first word
      if (idx > 0 && LOWERCASE_PARTICLES.has(lower)) return lower;
      // Handle hyphenated names like "Smith-Jones"
      return lower
        .split("-")
        .map((part) => (part.length > 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
        .join("-");
    })
    .join(" ");
}

/**
 * Format a phone number to international format.
 * If user types "0" at the start, replaces with "+27" (South Africa default).
 * Strips any characters except digits, +, and spaces.
 */
export function formatPhoneNumber(value: string): string {
  // Strip everything except digits, +, and spaces
  let cleaned = value.replace(/[^\d+\s]/g, "");

  // Replace leading 0 with +27
  if (cleaned.startsWith("0")) {
    cleaned = "+27" + cleaned.slice(1);
  }

  // Ensure it starts with +
  if (cleaned.length > 0 && !cleaned.startsWith("+")) {
    cleaned = "+" + cleaned;
  }

  return cleaned;
}

/**
 * Validate that a phone number is in valid international format.
 * Returns an error message or null if valid.
 */
export function validatePhoneNumber(value: string): string | null {
  if (!value || !value.trim()) return null; // optional field
  const digits = value.replace(/[^\d]/g, "");
  if (!value.startsWith("+")) return "Must start with + country code (e.g. +27)";
  if (digits.length < 10) return "Phone number too short";
  if (digits.length > 15) return "Phone number too long";
  return null;
}

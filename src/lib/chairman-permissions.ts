/** Financial viewing never implies authority to change the club's books. */
export const FINANCIAL_PERMISSION_SLUGS = ["finance", "fees"] as const;

export function isChairmanRole(roleName?: string | null): boolean {
  return roleName?.trim().toLowerCase() === "chairman";
}

export function chairmanMayChangeFinance(isChairman: boolean, isPlatformAdmin: boolean): boolean {
  return isPlatformAdmin || !isChairman;
}

export function chairmanCapabilityAllowed(capability: string): boolean {
  if (!capability.startsWith("fin.")) return true;
  return ["fin.overview.view", "fin.bank.view", "fin.reports.view"].includes(capability);
}

/**
 * Fee categories are club setup, not a financial transaction: the chairman may
 * add, edit, activate and delete them even though financial writes stay locked.
 */
export function chairmanMayEditFeeCategories(isChairman: boolean, canChangeFinance: boolean): boolean {
  return canChangeFinance || isChairman;
}
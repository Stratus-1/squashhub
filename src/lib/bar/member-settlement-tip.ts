import { emptyTip, tipQuote, type TipChoice } from "./tips";

export interface ServingPerson { id: string; name: string }

export function initialMemberTip(staff: ServingPerson[]): TipChoice {
  return { ...emptyTip, staffId: staff.length === 1 ? staff[0].id : "" };
}

export function memberSettlementTip(subtotal: number, choice: TipChoice, staff: ServingPerson[]) {
  const resolved = { ...choice, staffId: choice.staffId || (staff.length === 1 ? staff[0].id : "") };
  const quote = tipQuote(subtotal, resolved);
  if (quote.tip > 0 && !staff.some(person => person.id === resolved.staffId)) {
    throw new Error("Choose a person currently serving at this bar.");
  }
  return { ...quote, staffId: quote.tip > 0 ? resolved.staffId : null };
}
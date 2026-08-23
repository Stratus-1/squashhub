import { assertEquals } from 'jsr:@std/assert'
import { addBillingMonths, CYCLE_MONTHS, cycleDiscount } from './billing-cycle.ts'

Deno.test('monthly billing covers one undiscounted month', () => {
  assertEquals(CYCLE_MONTHS.monthly, 1)
  assertEquals(cycleDiscount('monthly'), 1)
  assertEquals(addBillingMonths(new Date('2026-09-01T00:00:00Z'), 'monthly').toISOString().slice(0, 10), '2026-10-01')
})

Deno.test('biannual billing covers six months at five percent off', () => {
  assertEquals(CYCLE_MONTHS.biannual, 6)
  assertEquals(cycleDiscount('biannual'), 0.95)
  assertEquals(addBillingMonths(new Date('2026-09-01T00:00:00Z'), 'biannual').toISOString().slice(0, 10), '2027-03-01')
})

Deno.test('annual billing covers twelve months at ten percent off', () => {
  assertEquals(CYCLE_MONTHS.annual, 12)
  assertEquals(cycleDiscount('annual'), 0.9)
  assertEquals(addBillingMonths(new Date('2026-09-01T00:00:00Z'), 'annual').toISOString().slice(0, 10), '2027-09-01')
})

Deno.test('billing periods clamp safely at month end', () => {
  assertEquals(addBillingMonths(new Date('2026-08-31T00:00:00Z'), 'biannual').toISOString().slice(0, 10), '2027-02-28')
})
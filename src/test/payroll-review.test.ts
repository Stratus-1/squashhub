import { describe, expect, it } from "vitest";
import { editPayrollReview, payrollLineError } from "@/lib/bar/payroll";
const initial = { quantity: "6.00", rate: "50.00", salary: "300.00", tips: "90.00", total: "390.00" };
describe("payday review overrides", () => {
  it("recalculates pay and total after hours are overridden", () => {
    expect(editPayrollReview(initial, "quantity", "8", "hourly")).toMatchObject({ salary: "400.00", total: "490.00" });
  });
  it("recalculates using an overridden fee", () => {
    expect(editPayrollReview(initial, "rate", "60", "hourly")).toMatchObject({ salary: "360.00", total: "450.00" });
  });
  it("allows pay to differ from hours times rate", () => {
    expect(editPayrollReview(initial, "salary", "325", "hourly")).toMatchObject({ quantity: "6.00", rate: "50.00", salary: "325", total: "415.00" });
  });
  it("total override changes wages without inventing tips", () => {
    expect(editPayrollReview(initial, "total", "500", "hourly")).toMatchObject({ salary: "410.00", tips: "90.00", total: "500" });
  });
  it("retains unpaid tip cap and refuses a total below tips", () => {
    expect(payrollLineError("300", "100", 90)).toBe("Tips exceed the unpaid tip balance");
    const edit = editPayrollReview(initial, "total", "50", "hourly");
    expect(payrollLineError(edit.salary, edit.tips, 90)).toBe("Amounts must be zero or more");
  });
  it("monthly and shift fees remain editable", () => {
    expect(editPayrollReview(initial, "rate", "1000", "monthly").salary).toBe("1000.00");
    expect(editPayrollReview(initial, "quantity", "4", "shift").salary).toBe("200.00");
  });
});
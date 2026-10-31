import { z } from "zod";

export const registrationOpeningSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  role: z.enum(["administrator", "chairman"]),
  confirmed: z.literal(true),
});
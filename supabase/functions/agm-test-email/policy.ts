export function testRecipient(destination: "self" | "member", adminEmail: string | undefined, member: { email?: string | null }) {
  const email = destination === "self" ? adminEmail : member.email;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("The selected recipient has no valid email address");
  return email;
}
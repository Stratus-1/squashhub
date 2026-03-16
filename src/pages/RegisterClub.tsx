import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useMyClub, useCreateClub } from "@/hooks/use-club";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Building2 } from "lucide-react";

export default function RegisterClub() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: existing, isLoading } = useMyClub();
  const createClub = useCreateClub();

  const [form, setForm] = useState({
    name: "",
    subdomain: "",
    address: "",
    email: "",
    phone: "",
  });

  const generateSubdomain = (name: string) => {
    const stopWords = ["squash", "club", "sports", "centre", "center", "the", "and"];
    const words = name.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => !stopWords.includes(w) && w.length > 0);
    return words.map(w => w.slice(0, 3)).join("").slice(0, 5) || name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5);
  };

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  if (existing?.club) {
    navigate("/club-admin", { replace: true });
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Club name is required"); return; }
    try {
      await createClub.mutateAsync(form);
      toast.success("Club registered! You are now the club captain.");
      navigate("/club-admin");
    } catch (err: any) {
      toast.error(err.message || "Failed to register club");
    }
  };

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <div className="min-h-screen bg-background pb-24">
      <PageHeader title="Register Your Club" subtitle="Set up your squash club as a tenant" />
      <div className="max-w-lg mx-auto space-y-6 p-4 md:p-8 pt-0">
        <div className="flex items-center gap-3">
          <Building2 className="w-8 h-8 text-primary" />
          <p className="text-sm text-muted-foreground">You'll become the club captain with full admin rights.</p>
        </div>

        <Card className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Club Name *</Label>
              <Input id="name" value={form.name} onChange={(e) => {
                const name = e.target.value;
                setForm(p => ({ ...p, name, subdomain: generateSubdomain(name) }));
              }} placeholder="e.g. CSIR Squash Club" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subdomain">Abbreviation <span className="text-xs text-muted-foreground">(you can edit)</span></Label>
              <div className="flex items-center gap-2">
                <Input id="subdomain" value={form.subdomain} onChange={set("subdomain")} placeholder="e.g. gbsq" maxLength={5} className="max-w-[120px]" />
                <span className="text-sm text-muted-foreground">.squashhub.app</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" value={form.address} onChange={set("address")} placeholder="Club address" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Club Email</Label>
              <Input id="email" type="email" value={form.email} onChange={set("email")} placeholder="club@example.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Club Phone</Label>
              <Input id="phone" type="tel" value={form.phone} onChange={set("phone")} placeholder="+27..." />
            </div>
            <Button type="submit" className="w-full" disabled={createClub.isPending}>
              {createClub.isPending ? "Registering..." : "Register Club"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}

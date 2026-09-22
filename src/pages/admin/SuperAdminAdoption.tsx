import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SEO } from "@/components/SEO";
import { Search, ShieldCheck, Activity, UserPlus, Mail } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";

type Row = {
  club_id: string;
  club_name: string;
  subdomain: string | null;
  tenant_type: string;
  created_at: string;
  members: number;
  signed_up: number;
  admins: number;
  first_signup: string | null;
  last_signup: string | null;
  signups_7d: number;
  signups_30d: number;
  first_member_id: string | null;
  first_member_name: string | null;
  first_member_email: string | null;
  has_subscription: boolean;
};

const ago = (v: string | null) =>
  v ? `${formatDistanceToNowStrict(new Date(v))} ago` : "—";

export default function SuperAdminAdoption() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "no_admin" | "dormant" | "never">("all");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["sa-adoption"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("platform_club_adoption");
      if (error) throw error;
      return (data || []) as Row[];
    },
  });

  const grantAdmin = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await (supabase.rpc as any)("platform_grant_club_admin", {
        p_club_member_id: memberId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Admin rights granted");
      qc.invalidateQueries({ queryKey: ["sa-adoption"] });
    },
    onError: (e: any) => toast.error(e.message || "Could not grant admin rights"),
  });

  const totals = useMemo(() => {
    const signedUp = rows.filter((r) => r.signed_up > 0);
    return {
      clubs: rows.length,
      withSignups: signedUp.length,
      new7d: rows.reduce((s, r) => s + Number(r.signups_7d || 0), 0),
      noAdmin: signedUp.filter((r) => Number(r.admins) === 0).length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !`${r.club_name} ${r.subdomain || ""}`.toLowerCase().includes(q)) return false;
      const signed = Number(r.signed_up);
      if (filter === "active") return signed > 0 && Number(r.signups_30d) > 0;
      if (filter === "no_admin") return signed > 0 && Number(r.admins) === 0;
      if (filter === "dormant") return signed > 0 && Number(r.signups_30d) === 0;
      if (filter === "never") return signed === 0;
      return true;
    });
  }, [rows, search, filter]);

  return (
    <div className="space-y-4 py-4">
      <SEO title="Club adoption — SquashHub Admin" description="Track which clubs have members signing up." />

      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4" />
        <h1 className="text-base font-semibold">Club adoption</h1>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Clubs on the system", value: totals.clubs },
          { label: "Clubs with sign-ups", value: totals.withSignups },
          { label: "Sign-ups last 7 days", value: totals.new7d },
          { label: "Signed up, no admin yet", value: totals.noAdmin },
        ].map((s) => (
          <Card key={s.label} className="p-3 bg-white/5 border-white/10">
            <div className="text-xs opacity-70">{s.label}</div>
            <div className="text-xl font-semibold">{s.value}</div>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 opacity-60" />
          <Input
            placeholder="Search clubs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="h-8 w-[220px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clubs</SelectItem>
            <SelectItem value="active">Active (sign-ups last 30 days)</SelectItem>
            <SelectItem value="no_admin">Signed up but no admin</SelectItem>
            <SelectItem value="dormant">Quiet (no sign-ups in 30 days)</SelectItem>
            <SelectItem value="never">Nobody has signed up</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-x-auto bg-white/5 border-white/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Club</TableHead>
              <TableHead className="text-xs text-right">On roster</TableHead>
              <TableHead className="text-xs text-right">Signed up</TableHead>
              <TableHead className="text-xs text-right">7d</TableHead>
              <TableHead className="text-xs text-right">30d</TableHead>
              <TableHead className="text-xs">Last sign-up</TableHead>
              <TableHead className="text-xs">Admin</TableHead>
              <TableHead className="text-xs">Paying</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-6 text-xs opacity-70">Loading...</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-6 text-xs opacity-70">No clubs match</TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.club_id}>
                  <TableCell className="text-xs">
                    <div className="font-medium">{r.club_name}</div>
                    <div className="opacity-60">{r.subdomain || "—"}</div>
                  </TableCell>
                  <TableCell className="text-xs text-right">{r.members}</TableCell>
                  <TableCell className="text-xs text-right font-medium">{r.signed_up}</TableCell>
                  <TableCell className="text-xs text-right">{r.signups_7d || "—"}</TableCell>
                  <TableCell className="text-xs text-right">{r.signups_30d || "—"}</TableCell>
                  <TableCell className="text-xs opacity-80">{ago(r.last_signup)}</TableCell>
                  <TableCell className="text-xs">
                    {Number(r.admins) > 0 ? (
                      <Badge variant="secondary" className="text-[10px] gap-1">
                        <ShieldCheck className="h-2.5 w-2.5" /> {r.admins}
                      </Badge>
                    ) : r.first_member_id ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[10px]"
                        disabled={grantAdmin.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Give ${r.first_member_name || "the first person who signed up"} full admin rights at ${r.club_name}?`,
                            )
                          ) {
                            grantAdmin.mutate(r.first_member_id!);
                          }
                        }}
                        title={r.first_member_email || undefined}
                      >
                        Make {r.first_member_name?.split(" ")[0] || "first user"} admin
                      </Button>
                    ) : (
                      <span className="text-xs opacity-50">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.has_subscription ? (
                      <Badge variant="secondary" className="text-[10px]">Yes</Badge>
                    ) : (
                      <span className="opacity-50">Trial</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <UnaffiliatedUsers clubs={rows.map((r) => ({ id: r.club_id, name: r.club_name }))} />
    </div>
  );
}

type Unaffiliated = {
  user_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
};

function UnaffiliatedUsers({ clubs }: { clubs: { id: string; name: string }[] }) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<Record<string, string>>({});

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["sa-unaffiliated"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("platform_unaffiliated_users");
      if (error) throw error;
      return (data || []) as Unaffiliated[];
    },
  });

  const attach = useMutation({
    mutationFn: async ({ userId, clubId }: { userId: string; clubId: string }) => {
      const { error } = await (supabase.rpc as any)("platform_attach_user_to_club", {
        p_user_id: userId,
        p_club_id: clubId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Person added to the club");
      qc.invalidateQueries({ queryKey: ["sa-unaffiliated"] });
      qc.invalidateQueries({ queryKey: ["sa-adoption"] });
    },
    onError: (e: any) => toast.error(e.message || "Could not add them"),
  });

  const sortedClubs = useMemo(
    () => [...clubs].sort((a, b) => a.name.localeCompare(b.name)),
    [clubs],
  );

  const emailAll = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("notify-unaffiliated", { body: {} });
      if (error) throw error;
      return data as { sent: number; skipped: number; candidates: number };
    },
    onSuccess: (d) =>
      toast.success(`Emails sent: ${d?.sent ?? 0} (${d?.skipped ?? 0} skipped — recently emailed)`),
    onError: (e: any) => toast.error(e.message || "Could not send the emails"),
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <UserPlus className="h-4 w-4" />
        <h2 className="text-sm font-semibold">
          Unaffiliated sign-ups {users.length ? `(${users.length})` : ""}
        </h2>
        {users.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[10px] ml-auto"
            disabled={emailAll.isPending}
            onClick={() => {
              if (window.confirm(`Email all ${users.length} of them asking them to choose their club?`)) {
                emailAll.mutate();
              }
            }}
          >
            <Mail className="h-3 w-3 mr-1" />
            {emailAll.isPending ? "Sending..." : "Email them all"}
          </Button>
        )}
      </div>
      <p className="text-xs opacity-70">
        People who created a login but were never linked to a club. Pick their club to add them.
      </p>
      <Card className="overflow-x-auto bg-white/5 border-white/10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs">Email</TableHead>
              <TableHead className="text-xs">Phone</TableHead>
              <TableHead className="text-xs">Signed up</TableHead>
              <TableHead className="text-xs">Assign to club</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-xs opacity-70">Loading...</TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-6 text-xs opacity-70">
                  Everyone who signed up is linked to a club
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                <TableRow key={u.user_id}>
                  <TableCell className="text-xs font-medium">{u.name || "—"}</TableCell>
                  <TableCell className="text-xs opacity-80">{u.email || "—"}</TableCell>
                  <TableCell className="text-xs opacity-80">{u.phone || "—"}</TableCell>
                  <TableCell className="text-xs opacity-80">{ago(u.created_at)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Select
                        value={picked[u.user_id] || ""}
                        onValueChange={(v) => setPicked((p) => ({ ...p, [u.user_id]: v }))}
                      >
                        <SelectTrigger className="h-7 w-[200px] text-xs">
                          <SelectValue placeholder="Choose club" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px]">
                          {sortedClubs.map((c) => (
                            <SelectItem key={c.id} value={c.id} className="text-xs">
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px]"
                        disabled={!picked[u.user_id] || attach.isPending}
                        onClick={() => attach.mutate({ userId: u.user_id, clubId: picked[u.user_id] })}
                      >
                        Add
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

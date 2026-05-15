import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fromExt } from "@/lib/supabase-ext";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Image as ImageIcon, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { TeamLogo } from "./TeamLogo";

interface Props {
  leagueId: string;
  clubId: string;
  currentLogoUrl?: string | null;
  teamName: string;
}

export function TeamLogoUpload({ leagueId, clubId, currentLogoUrl, teamName }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be under 2MB");
      return;
    }
    setBusy(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${clubId}/${leagueId}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("team-logos")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("team-logos").getPublicUrl(path);
      const { error: dbErr } = await fromExt("leagues")
        .update({ logo_url: pub.publicUrl })
        .eq("id", leagueId);
      if (dbErr) throw dbErr;
      toast.success("Logo updated");
      qc.invalidateQueries({ queryKey: ["leagues"] });
      qc.invalidateQueries({ queryKey: ["team-logos-by-code"] });
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    setBusy(true);
    const { error } = await fromExt("leagues").update({ logo_url: null }).eq("id", leagueId);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Logo removed");
    qc.invalidateQueries({ queryKey: ["leagues"] });
    qc.invalidateQueries({ queryKey: ["team-logos-by-code"] });
  };

  return (
    <div className="flex items-center gap-1.5">
      <TeamLogo logoUrl={currentLogoUrl} name={teamName} size={28} />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      <Button
        variant="outline"
        size="sm"
        className="h-6 text-[10px] gap-1 px-1.5"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        title={currentLogoUrl ? "Replace logo" : "Upload logo"}
      >
        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3 h-3" />}
        {currentLogoUrl ? "Change" : "Logo"}
      </Button>
      {currentLogoUrl && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-destructive"
          disabled={busy}
          onClick={handleRemove}
          title="Remove logo"
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      )}
    </div>
  );
}

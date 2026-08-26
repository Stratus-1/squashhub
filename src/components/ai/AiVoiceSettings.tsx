import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listVoices, RESPONSE_STYLES, speak, speechSupported, type VoiceOption } from "@/lib/ai/voice";
import { useAiAssistant, useUpdateAiPreferences } from "@/hooks/use-ai-assistant";

/** Personal voice + style preferences for the assistant. */
export function AiVoiceSettings() {
  const ai = useAiAssistant();
  const update = useUpdateAiPreferences();
  const [voices, setVoices] = useState<VoiceOption[]>([]);

  useEffect(() => {
    if (!speechSupported()) return;
    const load = () => setVoices(listVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  return (
    <div className="rounded-lg border p-3 space-y-3 text-[12px]">
      <div className="space-y-1">
        <Label className="text-[12px]">Voice</Label>
        <Select
          value={ai.voice ?? "default"}
          onValueChange={(v) => update.mutate({ voice: v === "default" ? null : v })}
        >
          <SelectTrigger className="h-8 text-[12px]">
            <SelectValue placeholder="Device default" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Device default</SelectItem>
            {voices.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px]"
          onClick={() => speak("Hi, I'm your SquashHub assistant. How can I help?", { voice: ai.voice, rate: ai.rate })}
        >
          Hear this voice
        </Button>
      </div>

      <div className="space-y-1">
        <Label className="text-[12px]">Speaking speed — {ai.rate.toFixed(2)}×</Label>
        <Slider
          value={[ai.rate]}
          min={0.7}
          max={1.4}
          step={0.05}
          onValueChange={([v]) => update.mutate({ rate: Number(v.toFixed(2)) })}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-[12px]">Response style</Label>
        <Select value={ai.style} onValueChange={(v) => update.mutate({ response_style: v })}>
          <SelectTrigger className="h-8 text-[12px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RESPONSE_STYLES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label} — {s.hint}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-[12px]">Read answers out loud</Label>
        <Switch
          checked={ai.prefs?.speak_replies ?? true}
          onCheckedChange={(v) => update.mutate({ speak_replies: v })}
        />
      </div>
    </div>
  );
}

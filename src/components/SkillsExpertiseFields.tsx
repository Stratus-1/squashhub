import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SKILL_GROUPS, SKILL_OPTIONS, skillLabel, normaliseSkills } from "@/lib/member-skills";

export type SkillsDraft = {
  occupation: string;
  skills: string[];
  skillsOther: string;
  volunteerWilling: boolean;
};

export function emptySkillsDraft(): SkillsDraft {
  return { occupation: "", skills: [], skillsOther: "", volunteerWilling: false };
}

export function skillsDraftFromMember(m: any): SkillsDraft {
  return {
    occupation: m?.occupation || "",
    skills: normaliseSkills(m?.skills),
    skillsOther: m?.skills_other || "",
    volunteerWilling: !!m?.volunteer_willing,
  };
}

/** Patch to write onto club_members. Blank is always allowed — never blocks. */
export function skillsPatch(d: SkillsDraft) {
  return {
    occupation: d.occupation.trim() || null,
    skills: d.skills,
    skills_other: d.skillsOther.trim() || null,
    volunteer_willing: !!d.volunteerWilling,
    skills_updated_at: new Date().toISOString(),
  };
}

/**
 * Shared "Skills & Expertise" form block — used in registration and My Profile.
 * Everything is optional.
 */
export function SkillsExpertiseFields({
  value,
  onChange,
  compact = false,
}: {
  value: SkillsDraft;
  onChange: (next: SkillsDraft) => void;
  compact?: boolean;
}) {
  const toggle = (skill: string) => {
    const has = value.skills.includes(skill);
    onChange({
      ...value,
      skills: has ? value.skills.filter((s) => s !== skill) : [...value.skills, skill],
    });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-sm">Occupation</Label>
        <Input
          value={value.occupation}
          onChange={(e) => onChange({ ...value, occupation: e.target.value })}
          placeholder="Optional — e.g. Civil engineer"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-sm">Skills you could offer the club</Label>
        <p className="text-[10px] text-muted-foreground -mt-1">
          Tap any that apply. Completely optional — you can add or change these later.
        </p>
        <div className={cn("space-y-2", compact && "max-h-56 overflow-y-auto pr-1")}>
          {SKILL_GROUPS.map((group) => (
            <div key={group} className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group}</p>
              <div className="flex flex-wrap gap-1.5">
                {SKILL_OPTIONS.filter((s) => s.group === group).map((s) => {
                  const active = value.skills.includes(s.value);
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => toggle(s.value)}
                      aria-pressed={active}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {value.skills.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {value.skills.map((s) => (
              <Badge key={s} variant="secondary" className="text-[10px]">{skillLabel(s)}</Badge>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm">Other skills</Label>
        <Input
          value={value.skillsOther}
          onChange={(e) => onChange({ ...value, skillsOther: e.target.value })}
          placeholder="Anything not listed — separate with commas"
        />
      </div>

      <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 p-2.5">
        <div className="min-w-0">
          <Label className="text-sm">I am willing to volunteer my skills</Label>
          <p className="text-[10px] text-muted-foreground">
            The club may contact you when a need or opportunity comes up.
          </p>
        </div>
        <Switch
          checked={value.volunteerWilling}
          onCheckedChange={(v) => onChange({ ...value, volunteerWilling: v })}
          aria-label="Willing to volunteer my skills"
        />
      </div>
    </div>
  );
}

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function CategorySeedingSelect({ value, onChange, label, previousStage = false }: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  previousStage?: boolean;
}) {
  return <Select value={value} onValueChange={onChange}>
    <SelectTrigger aria-label={label} className="h-8 text-[11px] min-w-0"><SelectValue /></SelectTrigger>
    <SelectContent>
      {previousStage && <SelectItem value="previous_stage">Use previous stage rankings</SelectItem>}
      <SelectItem value="ranking">Use rankings</SelectItem>
      <SelectItem value="ladder">Use the club ladder</SelectItem>
      <SelectItem value="manual">Manual seeds</SelectItem>
      <SelectItem value="random">Random placement</SelectItem>
      <SelectItem value="none">No seeding</SelectItem>
      <SelectItem value="later">Decide later</SelectItem>
    </SelectContent>
  </Select>;
}
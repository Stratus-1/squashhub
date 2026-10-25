type PairingStage = { id: string; unit: string; name: string; phase?: string; pairing?: string };
const order = (name: string) => /quarter/i.test(name) ? 0 : /semi/i.test(name) ? 1 : /final/i.test(name) ? 2 : 3;

/** Explicit category choice updates its timeline too, without changing sibling categories. */
export function choosePlayoffPairing<T extends PairingStage>(stages: T[], key: string, keys: string[], choice: string): T[] {
  const relevant = stages.filter((s) => s.phase === "playoff" && (!s.unit || s.unit === key || s.unit === key.split("::")[0]));
  const first = [...relevant].sort((a, b) => order(a.name) - order(b.name))[0];
  if (!first) return stages;
  const pairing = choice === "cross_pools" ? "crossover" : choice;
  return stages.flatMap((s) => {
    if (s.id !== first.id) return [s];
    if (!s.unit && keys.length > 1) return keys.map((unit) => ({ ...s, id: `${s.id}:${unit}`, unit, ...(unit === key ? { pairing } : {}) }));
    return [{ ...s, pairing }];
  }) as T[];
}
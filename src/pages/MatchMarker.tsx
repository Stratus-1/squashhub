import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { MarkerSetup, type MarkerConfig } from "@/components/marker/MarkerSetup";
import { MarkerScoreboard } from "@/components/marker/MarkerScoreboard";
import { SEO } from "@/components/SEO";

export default function MatchMarker() {
  const [config, setConfig] = useState<MarkerConfig | null>(null);

  const handleMatchComplete = (result: {
    games: { a: number; b: number; winnerId: "a" | "b" }[];
    winnerId: "a" | "b";
    durationSeconds: number;
  }) => {
    // Match is done — result is shown in the scoreboard
    console.log("Match complete", result);
  };

  return (
    <div className="bottom-nav-safe">
      <SEO title="Match Marker | SquashHub" description="Live squash scoring and marking tool for referees" />
      <PageHeader
        title="Match Marker"
        subtitle={config ? `${config.playerA.name} vs ${config.playerB.name}` : "Set up the match to begin scoring"}
      />

      <div className="px-4 mt-3 mb-6 max-w-lg mx-auto">
        {!config ? (
          <MarkerSetup onStart={setConfig} />
        ) : (
          <MarkerScoreboard
            config={config}
            onMatchComplete={handleMatchComplete}
            onReset={() => setConfig(null)}
          />
        )}
      </div>
    </div>
  );
}

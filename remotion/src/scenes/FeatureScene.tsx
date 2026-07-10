import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate, Sequence } from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadSans } from "@remotion/google-fonts/Inter";
import { NAVY, NAVY_DEEP, AMBER, CREAM } from "../theme";

const { fontFamily: display } = loadDisplay("normal", { weights: ["700"] });
const { fontFamily: sans } = loadSans("normal", { weights: ["400", "600", "700"] });

const FEATURES = [
  { label: "Court Bookings", num: "01" },
  { label: "League Scoring", num: "02" },
  { label: "Ladder & Ranks", num: "03" },
  { label: "Tournaments", num: "04" },
  { label: "Honesty Bar", num: "05" },
  { label: "Member Billing", num: "06" },
];

const FeatureCard: React.FC<{ i: number; label: string; num: string }> = ({ i, label, num }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - i * 6, fps, config: { damping: 16, stiffness: 110 } });
  const y = interpolate(s, [0, 1], [80, 0]);
  const op = interpolate(s, [0, 1], [0, 1]);
  return (
    <div style={{
      background: `${NAVY}`, border: `1px solid ${AMBER}33`,
      padding: "36px 40px", borderRadius: 4,
      transform: `translateY(${y}px)`, opacity: op,
      display: "flex", flexDirection: "column", justifyContent: "space-between",
      height: 220,
    }}>
      <div style={{ fontFamily: sans, color: AMBER, fontSize: 20, fontWeight: 700, letterSpacing: 4 }}>{num}</div>
      <div style={{ fontFamily: display, color: CREAM, fontSize: 42, lineHeight: 1.05, fontWeight: 700 }}>{label}</div>
    </div>
  );
};

export const FeatureScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const headSpring = spring({ frame, fps, config: { damping: 20 } });
  const headOp = interpolate(headSpring, [0, 1], [0, 1]);
  const headY = interpolate(headSpring, [0, 1], [30, 0]);

  return (
    <AbsoluteFill style={{ background: `linear-gradient(135deg, ${NAVY_DEEP} 0%, ${NAVY} 100%)`, padding: "80px 120px" }}>
      <div style={{ opacity: headOp, transform: `translateY(${headY}px)`, marginBottom: 60 }}>
        <div style={{ fontFamily: sans, color: AMBER, fontSize: 22, letterSpacing: 6, fontWeight: 600, textTransform: "uppercase", marginBottom: 16 }}>
          Everything your club runs on
        </div>
        <div style={{ fontFamily: display, color: CREAM, fontSize: 92, fontWeight: 700, lineHeight: 1, letterSpacing: -2 }}>
          Built for squash.
        </div>
      </div>
      <Sequence from={20}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
          {FEATURES.map((f, i) => <FeatureCard key={f.num} i={i} {...f} />)}
        </div>
      </Sequence>
    </AbsoluteFill>
  );
};

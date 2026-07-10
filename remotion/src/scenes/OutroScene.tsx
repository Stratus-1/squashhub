import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadSans } from "@remotion/google-fonts/Inter";
import { NAVY, NAVY_DEEP, AMBER, CREAM } from "../theme";

const { fontFamily: display } = loadDisplay("normal", { weights: ["700", "900"] });
const { fontFamily: sans } = loadSans("normal", { weights: ["400", "600"] });

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const bigSpring = spring({ frame, fps, config: { damping: 22, stiffness: 90 } });
  const scale = interpolate(bigSpring, [0, 1], [1.15, 1]);
  const op = interpolate(bigSpring, [0, 1], [0, 1]);

  const urlSpring = spring({ frame: frame - 30, fps, config: { damping: 20 } });
  const urlY = interpolate(urlSpring, [0, 1], [30, 0]);
  const urlOp = interpolate(urlSpring, [0, 1], [0, 1]);

  const ringScale = interpolate(frame, [0, 90], [0.4, 1.1], { extrapolateRight: "clamp" });
  const ringOp = interpolate(frame, [0, 30, 90], [0, 0.35, 0]);

  const pulse = 1 + Math.sin(frame / 8) * 0.02;

  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 60%, ${NAVY} 0%, ${NAVY_DEEP} 75%)`, alignItems: "center", justifyContent: "center" }}>
      {/* Rings */}
      <div style={{
        position: "absolute", width: 900, height: 900, borderRadius: "50%",
        border: `2px solid ${AMBER}`, opacity: ringOp,
        transform: `scale(${ringScale})`,
      }} />

      {/* Wordmark */}
      <div style={{
        opacity: op, transform: `scale(${scale * pulse})`, textAlign: "center",
      }}>
        <div style={{
          fontFamily: display, color: CREAM, fontSize: 240, fontWeight: 900,
          lineHeight: 0.9, letterSpacing: -6,
        }}>
          Squash<span style={{ color: AMBER }}>Hub</span>
        </div>
        <div style={{
          height: 4, width: 240, background: AMBER, margin: "32px auto",
        }} />
        <div style={{
          fontFamily: sans, color: CREAM, fontSize: 34, fontWeight: 400, letterSpacing: 6,
          textTransform: "uppercase", opacity: 0.85,
        }}>
          Run your club, better.
        </div>
      </div>

      {/* URL */}
      <div style={{
        position: "absolute", bottom: 100,
        fontFamily: sans, color: AMBER, fontSize: 28, fontWeight: 600, letterSpacing: 4,
        opacity: urlOp, transform: `translateY(${urlY}px)`,
      }}>
        SQUASHHUB.CO.ZA
      </div>
    </AbsoluteFill>
  );
};

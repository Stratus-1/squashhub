import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as loadSans } from "@remotion/google-fonts/Inter";
import { NAVY, NAVY_DEEP, AMBER, CREAM } from "../theme";

const { fontFamily: display } = loadDisplay("normal", { weights: ["700", "900"] });
const { fontFamily: sans } = loadSans("normal", { weights: ["400", "600"] });

export const IntroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const ballDrop = spring({ frame, fps, config: { damping: 12, stiffness: 120, mass: 1 } });
  const ballY = interpolate(ballDrop, [0, 1], [-400, 0]);
  const ballSquash = interpolate(frame, [18, 24, 32], [1, 0.55, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ballStretch = interpolate(frame, [18, 24, 32], [1, 1.4, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  const shock = interpolate(frame, [24, 60], [0, 1], { extrapolateRight: "clamp" });
  const shockOpacity = interpolate(frame, [24, 40, 60], [0.6, 0.25, 0]);
  const shockScale = interpolate(shock, [0, 1], [0.2, 3.5]);

  const titleSpring = spring({ frame: frame - 28, fps, config: { damping: 18, stiffness: 90 } });
  const titleY = interpolate(titleSpring, [0, 1], [40, 0]);
  const titleOpacity = interpolate(frame, [28, 44], [0, 1], { extrapolateRight: "clamp" });

  const subSpring = spring({ frame: frame - 46, fps, config: { damping: 20 } });
  const subOpacity = interpolate(subSpring, [0, 1], [0, 1]);
  const subX = interpolate(subSpring, [0, 1], [-30, 0]);

  const linePct = interpolate(frame, [50, 90], [0, 100], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 30% 20%, ${NAVY} 0%, ${NAVY_DEEP} 70%)`, overflow: "hidden" }}>
      {/* Court diagram — subtle back layer */}
      <svg width={width} height={height} style={{ position: "absolute", inset: 0, opacity: 0.08 }}>
        <rect x={width * 0.62} y={height * 0.15} width={width * 0.28} height={height * 0.7} fill="none" stroke={CREAM} strokeWidth={3} />
        <line x1={width * 0.62} y1={height * 0.55} x2={width * 0.9} y2={height * 0.55} stroke={CREAM} strokeWidth={2} />
        <line x1={width * 0.76} y1={height * 0.55} x2={width * 0.76} y2={height * 0.85} stroke={CREAM} strokeWidth={2} />
        <rect x={width * 0.7} y={height * 0.62} width={width * 0.12} height={height * 0.15} fill="none" stroke={CREAM} strokeWidth={2} />
      </svg>

      {/* Shockwave */}
      <div style={{
        position: "absolute", left: 240, top: 540,
        width: 40, height: 40, borderRadius: "50%",
        border: `3px solid ${AMBER}`,
        transform: `translate(-50%, -50%) scale(${shockScale})`,
        opacity: shockOpacity,
      }} />

      {/* Ball */}
      <div style={{
        position: "absolute", left: 240, top: 540,
        width: 40, height: 40, borderRadius: "50%",
        background: `radial-gradient(circle at 35% 30%, ${AMBER}, #8a4b00)`,
        boxShadow: `0 20px 40px rgba(0,0,0,0.4), inset -6px -8px 12px rgba(0,0,0,0.35)`,
        transform: `translate(-50%, -50%) translateY(${ballY}px) scale(${ballStretch}, ${ballSquash})`,
      }} />

      {/* Title block */}
      <div style={{
        position: "absolute", left: 320, top: 380, right: 120,
        transform: `translateY(${titleY}px)`, opacity: titleOpacity,
      }}>
        <div style={{
          fontFamily: sans, color: AMBER, fontSize: 26, letterSpacing: 8,
          fontWeight: 600, textTransform: "uppercase", marginBottom: 24,
        }}>
          Squash Club Management
        </div>
        <div style={{
          fontFamily: display, color: CREAM, fontSize: 200, lineHeight: 0.95,
          fontWeight: 900, letterSpacing: -4,
        }}>
          SquashHub
        </div>
      </div>

      {/* Underline */}
      <div style={{
        position: "absolute", left: 320, top: 640,
        width: 900, height: 4, background: `${AMBER}22`,
      }}>
        <div style={{ width: `${linePct}%`, height: "100%", background: AMBER }} />
      </div>

      {/* Tagline */}
      <div style={{
        position: "absolute", left: 320, top: 680,
        fontFamily: sans, color: CREAM, fontSize: 36, fontWeight: 400,
        opacity: subOpacity, transform: `translateX(${subX}px)`, letterSpacing: 1,
      }}>
        One platform. Every match.
      </div>
    </AbsoluteFill>
  );
};

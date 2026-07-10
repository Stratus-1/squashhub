import React from "react";
import { AbsoluteFill, Series } from "remotion";
import { IntroScene } from "./scenes/IntroScene";
import { FeatureScene } from "./scenes/FeatureScene";
import { OutroScene } from "./scenes/OutroScene";

export const MainVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0E1F35" }}>
      <Series>
        <Series.Sequence durationInFrames={150}>
          <IntroScene />
        </Series.Sequence>
        <Series.Sequence durationInFrames={150}>
          <FeatureScene />
        </Series.Sequence>
        <Series.Sequence durationInFrames={150}>
          <OutroScene />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};

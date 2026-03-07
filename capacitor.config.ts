import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.gbsquash.hub",
  appName: "GB Squash",
  webDir: "dist",
  bundledWebRuntime: false,
  plugins: {
    PushNotifications: {
      // Foreground behavior (especially important on iOS).
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
  server: {
    androidScheme: "https",
  },
};

export default config;

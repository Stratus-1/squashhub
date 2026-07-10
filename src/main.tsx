import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { initDeepLinks } from "@/lib/deep-links";
import { registerServiceWorker } from "@/lib/pwa-register";
import { isStandalone, markInstalled } from "@/lib/pwa-detect";
import { applyDynamicManifest } from "@/lib/dynamic-manifest";

// If the app launched in standalone mode, remember that this device has
// it installed. We use this later to detect uninstall + browser reopen.
if (isStandalone()) markInstalled();


// Initialize theme from localStorage before render.
// Default to DARK mode; users can opt into light via the theme toggle.
// Marketing/landing routes force dark via AppRoutes below.
const savedTheme = localStorage.getItem("theme");
if (savedTheme !== "light") {
  document.documentElement.classList.add("dark");
}

void initDeepLinks();

// Register the PWA service worker (no-op in iframe / preview / native).
registerServiceWorker();

// Swap the manifest to a per-tenant version so the home-screen label shows
// the club name (e.g. "Highveld Squash Club") instead of "SquashHub".
void applyDynamicManifest();

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);

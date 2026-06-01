import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { initDeepLinks } from "@/lib/deep-links";
import { registerServiceWorker } from "@/lib/pwa-register";

// Initialize theme from localStorage before render.
// Default to LIGHT mode for the in-app experience (white background, dark text
// — easier to read). Marketing/landing routes force dark via AppRoutes below.
// Users can still flip to dark globally via the theme toggle in Settings.
const savedTheme = localStorage.getItem("theme");
if (savedTheme === "dark") {
  document.documentElement.classList.add("dark");
}

void initDeepLinks();

// Register the PWA service worker (no-op in iframe / preview / native).
registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);

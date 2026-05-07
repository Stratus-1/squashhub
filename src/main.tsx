import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { initDeepLinks } from "@/lib/deep-links";

// Initialize theme from localStorage before render.
// Default to dark mode (the site is designed dark-first) unless the user
// has explicitly opted into light mode via the in-app theme toggle.
const savedTheme = localStorage.getItem("theme");
if (savedTheme !== "light") {
  document.documentElement.classList.add("dark");
}

void initDeepLinks();

// PWA fully removed — unregister any service workers from previous versions
// and clear caches so existing installs stop serving stale content.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => regs.forEach((reg) => void reg.unregister()))
    .catch(() => {});
  if ("caches" in window) {
    caches.keys().then((keys) => keys.forEach((k) => void caches.delete(k))).catch(() => {});
  }
}

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);

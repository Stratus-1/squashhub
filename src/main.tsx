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

// Prevent stale cached bundles in preview environments
if (
  "serviceWorker" in navigator &&
  (window.location.hostname.includes("lovableproject.com") || window.location.hostname.includes("id-preview--"))
) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((reg) => {
      void reg.unregister();
    });
  }).catch(() => {
    // ignore
  });
}

createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);

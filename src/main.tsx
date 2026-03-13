import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { initDeepLinks } from "@/lib/deep-links";

// Initialize theme from localStorage before render
const savedTheme = localStorage.getItem("theme");
if (savedTheme === "dark" || (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
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

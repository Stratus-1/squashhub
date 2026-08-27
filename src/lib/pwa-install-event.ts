export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type InstallPromptListener = (event: BeforeInstallPromptEvent | null) => void;

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let initialized = false;
const listeners = new Set<InstallPromptListener>();

function publish(): void {
  listeners.forEach((listener) => listener(deferredPrompt));
}

/**
 * Capture Chrome's one-shot install event before auth and club context finish
 * loading. UI listeners often mount later, so keeping this only in a React
 * component can permanently lose the prompt for that browser visit.
 */
export function initializeInstallPromptCapture(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    publish();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    publish();
  });
}

export function getInstallPromptEvent(): BeforeInstallPromptEvent | null {
  return deferredPrompt;
}

export function subscribeToInstallPrompt(listener: InstallPromptListener): () => void {
  listeners.add(listener);
  listener(deferredPrompt);
  return () => {
    listeners.delete(listener);
  };
}

export function consumeInstallPromptEvent(): void {
  deferredPrompt = null;
  publish();
}
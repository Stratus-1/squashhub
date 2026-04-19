import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from "react";
import { supabase } from "@/integrations/supabase/client";

declare global {
  interface Window {
    hcaptcha?: {
      render: (container: HTMLElement, params: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
      execute: (widgetId: string) => void;
      getResponse: (widgetId: string) => string;
      remove: (widgetId: string) => void;
    };
  }
}

export interface HCaptchaHandle {
  execute: () => Promise<string>;
}

let cachedSiteKey: string | null = null;
let siteKeyPromise: Promise<string | null> | null = null;

function getSiteKey(): Promise<string | null> {
  if (cachedSiteKey) return Promise.resolve(cachedSiteKey);
  if (siteKeyPromise) return siteKeyPromise;

  siteKeyPromise = supabase.functions
    .invoke("verify-captcha", { body: { action: "config" } })
    .then(({ data, error }) => {
      if (error) return null;
      const key =
        typeof data?.siteKey === "string" && data.siteKey.trim().length > 0
          ? data.siteKey.trim()
          : null;
      if (key) cachedSiteKey = key;
      siteKeyPromise = null;
      return key;
    })
    .catch(() => {
      siteKeyPromise = null;
      return null;
    });

  return siteKeyPromise;
}

const renderedWidgets = new WeakSet<HTMLElement>();

export const HCaptcha = forwardRef<HCaptchaHandle>((_props, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const resolveRef = useRef<((token: string) => void) | null>(null);
  const readyRef = useRef(false);

  const renderWidget = useCallback((siteKey: string) => {
    const el = containerRef.current;
    if (!el) return;
    // If the hCaptcha API isn't ready yet, poll until it is.
    if (!window.hcaptcha || typeof window.hcaptcha.render !== "function") {
      const poll = setInterval(() => {
        if (window.hcaptcha && typeof window.hcaptcha.render === "function") {
          clearInterval(poll);
          renderWidget(siteKey);
        }
      }, 100);
      return;
    }
    if (renderedWidgets.has(el)) {
      // Already rendered for this element (e.g. from a prior mount in the same tree).
      // Mark ready so execute() works.
      readyRef.current = true;
      return;
    }

    renderedWidgets.add(el);
    const id = window.hcaptcha.render(el, {
      sitekey: siteKey,
      size: "invisible",
      callback: (token: string) => {
        resolveRef.current?.(token);
        resolveRef.current = null;
      },
      "error-callback": () => {
        resolveRef.current = null;
      },
    });
    widgetIdRef.current = id;
    readyRef.current = true;
  }, []);

  useEffect(() => {
    let cancelled = false;

    getSiteKey().then((key) => {
      if (cancelled || !key) return;

      const tryRender = () => renderWidget(key);

      if (!document.getElementById("hcaptcha-script")) {
        const script = document.createElement("script");
        script.id = "hcaptcha-script";
        script.src = "https://js.hcaptcha.com/1/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        script.onload = () => tryRender();
        document.head.appendChild(script);
      } else if (window.hcaptcha) {
        tryRender();
      } else {
        const interval = setInterval(() => {
          if (window.hcaptcha) {
            clearInterval(interval);
            tryRender();
          }
        }, 100);
        return () => clearInterval(interval);
      }
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    execute: () =>
      new Promise<string>((resolve, reject) => {
        const tryExecute = (attemptsLeft: number) => {
          if (readyRef.current && window.hcaptcha && widgetIdRef.current !== null) {
            resolveRef.current = resolve;
            window.hcaptcha.reset(widgetIdRef.current);
            window.hcaptcha.execute(widgetIdRef.current);
            return;
          }
          if (attemptsLeft <= 0) {
            reject(new Error("hCaptcha not ready"));
            return;
          }
          setTimeout(() => tryExecute(attemptsLeft - 1), 200);
        };
        // Wait up to ~3s for the widget to finish initialising.
        tryExecute(15);
      }),
  }));

  return <div ref={containerRef} />;
});

HCaptcha.displayName = "HCaptcha";

export async function verifyCaptchaToken(token: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke("verify-captcha", {
      body: { token },
    });
    if (error) return false;
    return data?.success === true;
  } catch {
    return false;
  }
}

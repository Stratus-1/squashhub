import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

declare global {
  interface Window {
    hcaptcha?: {
      render: (container: HTMLElement, params: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
      getResponse: (widgetId: string) => string;
      remove: (widgetId: string) => void;
    };
  }
}

interface HCaptchaProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
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

// Global registry so each container only gets one widget
const renderedWidgets = new WeakSet<HTMLElement>();

export function HCaptcha({ onVerify, onExpire }: HCaptchaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);

  // Keep refs current without triggering effects
  onVerifyRef.current = onVerify;
  onExpireRef.current = onExpire;

  const renderWidget = useCallback((siteKey: string) => {
    const el = containerRef.current;
    if (!el || !window.hcaptcha) return;
    // Already rendered in this DOM node — don't re-render
    if (renderedWidgets.has(el)) return;

    renderedWidgets.add(el);
    window.hcaptcha.render(el, {
      sitekey: siteKey,
      callback: (token: string) => onVerifyRef.current(token),
      "expired-callback": () => onExpireRef.current?.(),
      size: "compact",
    });
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

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="flex justify-center my-2" />;
}

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

import { useEffect, useRef, useState } from "react";
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

async function getSiteKey(): Promise<string | null> {
  if (cachedSiteKey) return cachedSiteKey;

  const { data, error } = await supabase.functions.invoke("verify-captcha", {
    body: { action: "config" },
  });

  if (error) return null;

  const key = typeof data?.siteKey === "string" && data.siteKey.trim().length > 0
    ? data.siteKey.trim()
    : null;

  if (key) cachedSiteKey = key;
  return key;
}

export function HCaptcha({ onVerify, onExpire }: HCaptchaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);
  const [siteKey, setSiteKey] = useState<string | null>(null);

  // Keep refs in sync without triggering re-renders
  onVerifyRef.current = onVerify;
  onExpireRef.current = onExpire;

  useEffect(() => {
    getSiteKey().then(setSiteKey);
  }, []);

  useEffect(() => {
    if (!siteKey) return;

    const doRender = () => {
      if (!containerRef.current || !window.hcaptcha || widgetIdRef.current !== null) return;

      widgetIdRef.current = window.hcaptcha.render(containerRef.current, {
        sitekey: siteKey,
        callback: (token: string) => onVerifyRef.current(token),
        "expired-callback": () => onExpireRef.current?.(),
        size: "compact",
      });
    };

    if (!document.getElementById("hcaptcha-script")) {
      const script = document.createElement("script");
      script.id = "hcaptcha-script";
      script.src = "https://js.hcaptcha.com/1/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.onload = () => doRender();
      document.head.appendChild(script);
    } else if (window.hcaptcha) {
      doRender();
    } else {
      const interval = setInterval(() => {
        if (window.hcaptcha) {
          clearInterval(interval);
          doRender();
        }
      }, 100);
      return () => clearInterval(interval);
    }

    return () => {
      if (widgetIdRef.current !== null && window.hcaptcha) {
        try { window.hcaptcha.remove(widgetIdRef.current); } catch { /* ignore */ }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  if (!siteKey) return null;

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

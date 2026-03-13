import { useEffect, useRef, useCallback } from "react";

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

const SITE_KEY = import.meta.env.VITE_HCAPTCHA_SITE_KEY as string | undefined;

export function HCaptcha({ onVerify, onExpire }: HCaptchaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.hcaptcha || widgetIdRef.current !== null) return;
    if (!SITE_KEY) return;

    widgetIdRef.current = window.hcaptcha.render(containerRef.current, {
      sitekey: SITE_KEY,
      callback: (token: string) => onVerify(token),
      "expired-callback": () => onExpire?.(),
      size: "compact",
    });
  }, [onVerify, onExpire]);

  useEffect(() => {
    if (!SITE_KEY) return;

    // Load the hCaptcha script if not already loaded
    if (!document.getElementById("hcaptcha-script")) {
      const script = document.createElement("script");
      script.id = "hcaptcha-script";
      script.src = "https://js.hcaptcha.com/1/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.onload = () => renderWidget();
      document.head.appendChild(script);
    } else if (window.hcaptcha) {
      renderWidget();
    } else {
      // Script is loading, wait for it
      const interval = setInterval(() => {
        if (window.hcaptcha) {
          clearInterval(interval);
          renderWidget();
        }
      }, 100);
      return () => clearInterval(interval);
    }

    return () => {
      if (widgetIdRef.current !== null && window.hcaptcha) {
        try {
          window.hcaptcha.remove(widgetIdRef.current);
        } catch {
          // ignore
        }
        widgetIdRef.current = null;
      }
    };
  }, [renderWidget]);

  if (!SITE_KEY) return null;

  return <div ref={containerRef} className="flex justify-center my-2" />;
}

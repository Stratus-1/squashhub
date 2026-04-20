import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from "react";
import { supabase } from "@/integrations/supabase/client";

// NOTE: Filename kept as HCaptcha.tsx for backward import compatibility,
// but this component now wraps Google reCAPTCHA v2 (invisible).

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      render: (container: HTMLElement | string, params: Record<string, unknown>) => number;
      reset: (widgetId?: number) => void;
      execute: (widgetId?: number) => void;
      getResponse: (widgetId?: number) => string;
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

const renderedWidgets = new WeakMap<HTMLElement, number>();

export const HCaptcha = forwardRef<HCaptchaHandle>((_props, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<number | null>(null);
  const resolveRef = useRef<((token: string) => void) | null>(null);
  const rejectRef = useRef<((err: Error) => void) | null>(null);
  const readyRef = useRef(false);

  const renderWidget = useCallback((siteKey: string) => {
    const el = containerRef.current;
    if (!el) return;
    if (!window.grecaptcha || typeof window.grecaptcha.render !== "function") {
      const poll = setInterval(() => {
        if (window.grecaptcha && typeof window.grecaptcha.render === "function") {
          clearInterval(poll);
          renderWidget(siteKey);
        }
      }, 100);
      return;
    }
    const existing = renderedWidgets.get(el);
    if (existing !== undefined) {
      widgetIdRef.current = existing;
      readyRef.current = true;
      return;
    }

    try {
      const id = window.grecaptcha.render(el, {
        sitekey: siteKey,
        size: "normal",
        callback: (token: string) => {
          resolveRef.current?.(token);
          resolveRef.current = null;
          rejectRef.current = null;
        },
        "expired-callback": () => {
          resolveRef.current = null;
          rejectRef.current = null;
        },
        "error-callback": () => {
          rejectRef.current?.(new Error("reCAPTCHA error"));
          resolveRef.current = null;
          rejectRef.current = null;
        },
      });
      renderedWidgets.set(el, id);
      widgetIdRef.current = id;
      readyRef.current = true;
    } catch (err) {
      console.warn("[reCAPTCHA] render failed:", err);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    getSiteKey().then((key) => {
      if (cancelled || !key) return;

      const tryRender = () => {
        if (window.grecaptcha && typeof window.grecaptcha.render === "function") {
          renderWidget(key);
        } else if (window.grecaptcha?.ready) {
          window.grecaptcha.ready(() => renderWidget(key));
        } else {
          const interval = setInterval(() => {
            if (window.grecaptcha && typeof window.grecaptcha.render === "function") {
              clearInterval(interval);
              renderWidget(key);
            }
          }, 100);
        }
      };

      if (!document.getElementById("recaptcha-script")) {
        const script = document.createElement("script");
        script.id = "recaptcha-script";
        script.src = "https://www.google.com/recaptcha/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        script.onload = () => tryRender();
        document.head.appendChild(script);
      } else {
        tryRender();
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    execute: () =>
      new Promise<string>((resolve, reject) => {
        const tryGet = (attemptsLeft: number) => {
          if (readyRef.current && window.grecaptcha && widgetIdRef.current !== null) {
            try {
              const existing = window.grecaptcha.getResponse(widgetIdRef.current);
              if (existing && existing.length > 0) {
                resolve(existing);
                return;
              }
            } catch {
              // fall through and wait for callback
            }
            // Checkbox not yet completed — wait for the user to tick it
            resolveRef.current = resolve;
            rejectRef.current = (err) => reject(err);
            return;
          }
          if (attemptsLeft <= 0) {
            reject(new Error("Please complete the reCAPTCHA checkbox"));
            return;
          }
          setTimeout(() => tryGet(attemptsLeft - 1), 200);
        };
        tryGet(15);
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

import { Capacitor } from "@capacitor/core";
import { useMemo } from "react";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { useNativePushNotifications } from "@/hooks/use-native-push-notifications";

export function useAppPushNotifications() {
  const isNative = useMemo(() => Capacitor.isNativePlatform(), []);

  const web = usePushNotifications();
  const native = useNativePushNotifications();

  return isNative
    ? { ...native, kind: "native" as const }
    : { ...web, kind: "web" as const };
}


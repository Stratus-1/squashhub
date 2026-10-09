import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Bluetooth, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { isWebBluetoothAvailable } from "@/lib/shelly-ble";
import { describeDoorCompatibility, detectIos } from "@/lib/door-compatibility";

/** Shows members whether this phone can open the door via internet and/or Bluetooth. */
export function DoorCompatibilityCheck({ className }: { className?: string }) {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);

  const c = describeDoorCompatibility({
    online,
    native: Capacitor.isNativePlatform(),
    webBluetooth: isWebBluetoothAvailable(),
    ios: detectIos(navigator.userAgent, navigator.maxTouchPoints > 1),
  });

  const pill = (ok: boolean, label: string, Icon: typeof Wifi) => (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
      ok ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
    )}>
      <Icon className="w-3 h-3" />{label}
    </span>
  );

  return (
    <div className={cn("space-y-1", className)} aria-label="Door access compatibility">
      <div className="flex flex-wrap gap-1.5">
        {pill(c.internet === "ok", c.internet === "ok" ? "Internet: ready" : "Internet: offline", c.internet === "ok" ? Wifi : WifiOff)}
        {pill(c.bluetooth === "ok", c.bluetooth === "ok" ? "Bluetooth backup: ready" : "Bluetooth backup: not on this device", Bluetooth)}
      </div>
      {c.advice && (
        <p className={cn("text-[11px]", c.tone === "error" ? "text-destructive" : "text-muted-foreground")}>{c.advice}</p>
      )}
    </div>
  );
}

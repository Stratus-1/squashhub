import stravaLogo from "@/assets/integrations/strava.svg";
import appleHealthLogo from "@/assets/integrations/apple-health.svg";
import samsungHealthLogo from "@/assets/integrations/samsung-health.svg";
import huaweiHealthLogo from "@/assets/integrations/huawei-health.svg";
import garminLogo from "@/assets/integrations/garmin.svg";
import type { IntegrationProvider } from "@/hooks/use-data";
import { cn } from "@/lib/utils";

const providerToLogo: Record<IntegrationProvider, { src: string; alt: string }> = {
  strava: { src: stravaLogo, alt: "Strava" },
  apple_health: { src: appleHealthLogo, alt: "Apple Health" },
  samsung_health: { src: samsungHealthLogo, alt: "Samsung Health" },
  huawei_health: { src: huaweiHealthLogo, alt: "Huawei Health" },
  garmin: { src: garminLogo, alt: "Garmin" },
};

export function IntegrationLogo({
  provider,
  className,
}: {
  provider: IntegrationProvider;
  className?: string;
}) {
  const { src, alt } = providerToLogo[provider];
  return (
    <img
      src={src}
      alt={alt}
      className={cn("h-9 w-9 rounded-md", className)}
      loading="lazy"
    />
  );
}

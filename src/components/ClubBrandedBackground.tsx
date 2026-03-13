import { useMyClub } from "@/hooks/use-club";

/**
 * Renders the club logo as a subtle watermark background.
 * Place inside a relative-positioned container.
 */
export function ClubBrandedBackground() {
  const { data: clubData } = useMyClub();
  const logoUrl = clubData?.club?.logo_url;

  if (!logoUrl) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden"
      aria-hidden="true"
    >
      <img
        src={logoUrl}
        alt=""
        className="w-[420px] h-[420px] object-contain opacity-[0.03] dark:opacity-[0.05] select-none"
        draggable={false}
      />
    </div>
  );
}

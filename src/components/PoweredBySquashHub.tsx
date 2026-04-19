export function PoweredBySquashHub() {
  // Always send users to the SquashHub apex (root), not the current subdomain.
  const host = window.location.hostname;
  const isPreview = host.includes("lovable");

  let href = "https://www.squashhub.co.za";
  if (isPreview) {
    // On preview: strip any tenant subdomain and go to the apex preview host.
    // e.g. "gb.id-preview--abc.lovable.app" → "https://id-preview--abc.lovable.app"
    const parts = host.split(".");
    const apex = parts.length > 3 ? parts.slice(1).join(".") : host;
    href = `${window.location.protocol}//${apex}`;
  } else if (host.endsWith(".squashhub.co.za")) {
    href = "https://www.squashhub.co.za";
  }

  return (
    <p className="text-[11px] text-muted-foreground/70 text-center pt-4 pb-2">
      Powered by{" "}
      <a
        href={href}
        className="font-semibold text-foreground/60 hover:text-primary transition-colors"
        target="_blank"
        rel="noopener noreferrer"
      >
        SquashHub
      </a>
    </p>
  );
}

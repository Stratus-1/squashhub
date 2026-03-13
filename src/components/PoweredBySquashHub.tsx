export function PoweredBySquashHub() {
  const mainDomain = "https://www.squashhub.co.za";
  const isPreview = window.location.hostname.includes("lovable");
  const href = isPreview ? "/" : mainDomain;

  return (
    <p className="text-[11px] text-muted-foreground/70 text-center pt-4 pb-2">
      Powered by{" "}
      <a
        href={href}
        className="font-semibold text-foreground/60 hover:text-primary transition-colors"
        target={isPreview ? undefined : "_blank"}
        rel="noopener noreferrer"
      >
        SquashHub
      </a>
    </p>
  );
}

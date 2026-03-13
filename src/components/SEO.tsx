import { Helmet } from "react-helmet-async";
import { absoluteUrl } from "@/lib/site";

interface SEOProps {
  title?: string;
  description?: string;
  path?: string;
  type?: string;
  image?: string;
  imageAlt?: string;
  noIndex?: boolean;
  jsonLd?: unknown;
  /** Override the site name used in the tab title (defaults to "SquashHub") */
  siteName?: string;
}

const DEFAULT_TITLE = "SquashHub";
const DEFAULT_DESC = "The all-in-one platform for squash clubs. Court bookings, ladders, championships, member management and more.";
const DEFAULT_IMAGE = absoluteUrl("/pwa-512x512.png");

export function SEO({
  title,
  description = DEFAULT_DESC,
  path,
  type = "website",
  image = DEFAULT_IMAGE,
  imageAlt,
  noIndex = false,
  jsonLd,
  siteName,
}: SEOProps) {
  const brand = siteName || DEFAULT_TITLE;
  const fullTitle = title ? `${title} | ${brand}` : brand;
  const resolvedPath =
    path ??
    (typeof window !== "undefined" ? window.location.pathname : "/");
  const url = absoluteUrl(resolvedPath);
  const resolvedImage = absoluteUrl(image);
  const resolvedImageAlt = (imageAlt || "").trim() || `${brand} logo`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      <meta name="robots" content={noIndex ? "noindex, nofollow" : "index, follow"} />

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content={type} />
      <meta property="og:image" content={resolvedImage} />
      <meta property="og:image:alt" content={resolvedImageAlt} />
      <meta property="og:site_name" content={brand} />
      <meta property="og:locale" content="en_ZA" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={resolvedImage} />
      <meta name="twitter:image:alt" content={resolvedImageAlt} />

      {/* JSON-LD */}
      {jsonLd && (
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      )}
    </Helmet>
  );
}

import { Helmet } from "react-helmet-async";

interface SEOProps {
  title?: string;
  description?: string;
  path?: string;
  type?: string;
  image?: string;
  noIndex?: boolean;
  jsonLd?: Record<string, any>;
}

const BASE_URL = "https://gordon-s-bay-squash-hub.vercel.app";
const DEFAULT_TITLE = "Gordon's Bay Squash Club";
const DEFAULT_DESC = "Book courts, challenge players, and climb the social league ladder at Gordon's Bay Squash Club.";
const DEFAULT_IMAGE = `${BASE_URL}/pwa-512x512.png`;

export function SEO({
  title,
  description = DEFAULT_DESC,
  path = "/",
  type = "website",
  image = DEFAULT_IMAGE,
  noIndex = false,
  jsonLd,
}: SEOProps) {
  const fullTitle = title ? `${title} | ${DEFAULT_TITLE}` : DEFAULT_TITLE;
  const url = `${BASE_URL}${path}`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      {noIndex && <meta name="robots" content="noindex, nofollow" />}

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content={type} />
      <meta property="og:image" content={image} />
      <meta property="og:site_name" content={DEFAULT_TITLE} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />

      {/* JSON-LD */}
      {jsonLd && (
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      )}
    </Helmet>
  );
}

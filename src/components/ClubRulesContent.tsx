import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { ClubRuleDocument, parseRuleBlocks } from "@/lib/club-rules";
import { signRuleDocument } from "@/hooks/use-club-rules";

/**
 * Renders a club's membership rules + documents. Used identically on the
 * public landing page and inside member registration so the content and
 * wording can never drift between the two.
 */
export function ClubRulesContent({
  rulesText,
  documents = [],
  tone = "default",
}: {
  rulesText?: string | null;
  documents?: ClubRuleDocument[];
  /** "onDark" is used over the landing hero, "default" inside the app. */
  tone?: "default" | "onDark";
}) {
  const [openingPath, setOpeningPath] = useState<string | null>(null);
  const blocks = parseRuleBlocks(rulesText || "");

  const headingClass = tone === "onDark" ? "text-white" : "text-foreground";
  const bodyClass = tone === "onDark" ? "text-white/90" : "text-muted-foreground";
  const docClass =
    tone === "onDark"
      ? "border-white/20 bg-white/5 text-white hover:bg-white/10"
      : "border-border bg-muted/40 text-foreground hover:bg-muted";

  const openDoc = async (doc: ClubRuleDocument) => {
    setOpeningPath(doc.path);
    try {
      const url = await signRuleDocument(doc.path);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setOpeningPath(null);
    }
  };

  return (
    <div className="space-y-4 text-left">
      {blocks.map((block, i) => (
        <div key={i} className="space-y-1">
          {block.heading && (
            <h3 className={`text-sm font-bold ${headingClass}`}>{block.heading}</h3>
          )}
          {block.lines.length > 0 && (
            <ol className={`list-decimal pl-5 space-y-1 text-[13px] leading-snug ${bodyClass}`}>
              {block.lines.map((line, j) => (
                <li key={j}>{line}</li>
              ))}
            </ol>
          )}
        </div>
      ))}

      {documents.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <h3 className={`text-sm font-bold ${headingClass}`}>Documents</h3>
          <ul className="space-y-1.5">
            {documents.map((doc) => (
              <li key={doc.path}>
                <button
                  type="button"
                  onClick={() => openDoc(doc)}
                  className={`w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] transition-colors ${docClass}`}
                >
                  {openingPath === doc.path ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  ) : (
                    <FileText className="w-4 h-4 shrink-0" />
                  )}
                  <span className="truncate text-left">{doc.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

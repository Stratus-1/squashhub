import { useMemo } from "react";
import { toast } from "sonner";
import { FileText, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { BackToDashboard } from "@/components/BackToDashboard";
import { useClubContext } from "@/contexts/ClubContext";
import { useMyClub } from "@/hooks/use-club";
import { useClubDocumentCategories, useClubDocuments, openClubDocument } from "@/hooks/use-club-documents";
import { documentMetaLine, memberView } from "@/lib/club-documents";

/** Member view of the club document library: only shared documents in shared categories. */
export default function ClubDocuments() {
  const { club: contextClub } = useClubContext();
  const { data } = useMyClub();
  const clubId = (contextClub as any)?.id || data?.club?.id;
  const { data: categories = [], isLoading: l1 } = useClubDocumentCategories(clubId);
  const { data: documents = [], isLoading: l2 } = useClubDocuments(clubId);
  const groups = useMemo(() => memberView(categories, documents), [categories, documents]);

  return (
    <div className="min-h-screen bg-background pb-20">
      <PageHeader title="Club Documents" />
      <div className="max-w-3xl mx-auto px-4 space-y-3">
        <BackToDashboard />
        {(l1 || l2) ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : groups.length === 0 ? (
          <Card className="p-6 text-center text-[13px] text-muted-foreground">Your club hasn't shared any documents yet.</Card>
        ) : groups.map(({ category, documents: docs }) => (
          <Card key={category.id} className="overflow-hidden">
            <div className="border-b border-border bg-muted/40 px-3 py-2 font-semibold text-[13px]">{category.name}</div>
            <ul className="divide-y divide-border">
              {docs.map((doc) => (
                <li key={doc.id}>
                  <button type="button" className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/50"
                    onClick={async () => { if (!(await openClubDocument(doc))) toast.error("Could not open document"); }}>
                    <FileText className="w-4 h-4 shrink-0 self-start mt-0.5 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]">{doc.title}</span>
                      {doc.description && (
                        <span className="block text-[11px] text-muted-foreground line-clamp-3">{doc.description}</span>
                      )}
                      <span className="block text-[10px] text-muted-foreground">{documentMetaLine(doc)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, FileText, FolderPlus, Loader2, Pencil, Trash2, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useClubDocumentCategories, useClubDocumentMutations, useClubDocuments, openClubDocument,
} from "@/hooks/use-club-documents";
import {
  CLUB_LIBRARY_MAX_BYTES, formatFileSize, groupByCategory, isDocumentVisibleToMembers, titleFromFileName,
  type ClubDocument, type ClubDocumentCategory,
} from "@/lib/club-documents";

type UploadDraft = { file: File; title: string; categoryId: string; membersVisible: boolean };

export function ClubDocumentsLibrary({ clubId }: { clubId: string }) {
  const { data: categories = [], isLoading: catsLoading } = useClubDocumentCategories(clubId);
  const { data: documents = [], isLoading: docsLoading } = useClubDocuments(clubId);
  const m = useClubDocumentMutations(clubId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);
  const [draft, setDraft] = useState<UploadDraft | null>(null);
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [renameCat, setRenameCat] = useState<ClubDocumentCategory | null>(null);
  const [editDoc, setEditDoc] = useState<ClubDocument | null>(null);
  const [confirmDoc, setConfirmDoc] = useState<ClubDocument | null>(null);
  const [confirmCat, setConfirmCat] = useState<ClubDocumentCategory | null>(null);

  const groups = useMemo(() => groupByCategory(categories, documents), [categories, documents]);
  const sharedCount = documents.filter((d) =>
    isDocumentVisibleToMembers(d, categories.find((c) => c.id === d.category_id))).length;

  const pickFile = (categoryId: string | null) => {
    setPendingCategory(categoryId);
    fileRef.current?.click();
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > CLUB_LIBRARY_MAX_BYTES) {
      toast.error("Documents must be under 20MB");
      return;
    }
    setDraft({
      file,
      title: titleFromFileName(file.name),
      categoryId: pendingCategory || categories[0]?.id || "",
      membersVisible: false,
    });
  };

  const run = async (p: Promise<unknown>, ok: string) => {
    try { await p; toast.success(ok); return true; }
    catch (err: any) { toast.error(err?.message || "Something went wrong"); return false; }
  };

  const doUpload = async () => {
    if (!draft || !draft.title.trim() || !draft.categoryId) return;
    if (await run(m.upload.mutateAsync(draft), draft.membersVisible ? "Document uploaded and shared with members" : "Document uploaded (hidden from members)")) {
      setDraft(null);
    }
  };

  const open = async (doc: ClubDocument) => {
    if (!(await openClubDocument(doc))) toast.error("Could not open document");
  };

  if (catsLoading || docsLoading) {
    return <Card className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></Card>;
  }

  return (
    <Card className="p-4 md:p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-sm">Club documents</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Upload documents into categories. Members only see a document when both the document and its
            category are switched to <span className="font-medium text-foreground">Visible to members</span>.
            {" "}{sharedCount} of {documents.length} document{documents.length === 1 ? "" : "s"} shared.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => { setNewCatName(""); setNewCatOpen(true); }}>
            <FolderPlus className="w-3.5 h-3.5 mr-1" /> New category
          </Button>
          <Button size="sm" onClick={() => pickFile(null)} disabled={categories.length === 0}>
            <Upload className="w-3.5 h-3.5 mr-1" /> Upload document
          </Button>
        </div>
      </div>
      <input ref={fileRef} type="file" className="hidden" onChange={onFile}
        accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt" />

      <div className="space-y-3">
        {groups.map(({ category, documents: docs }) => (
          <div key={category.id} className="rounded-lg border border-border">
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
              <span className="font-semibold text-[13px]">{category.name}</span>
              <Badge variant="outline" className="h-5 text-[10px]">{docs.length}</Badge>
              {category.standard_key && <Badge variant="secondary" className="h-5 text-[10px]">Standard</Badge>}
              <div className="ml-auto flex items-center gap-1">
                <div className="flex items-center gap-1.5 mr-1">
                  <Switch
                    id={`cat-vis-${category.id}`}
                    checked={category.members_visible}
                    onCheckedChange={(v) => run(m.updateCategory.mutateAsync({ id: category.id, members_visible: v }),
                      v ? `"${category.name}" visible to members` : `"${category.name}" hidden from members`)}
                  />
                  <Label htmlFor={`cat-vis-${category.id}`} className="text-[11px] font-normal cursor-pointer">
                    {category.members_visible ? "Visible to members" : "Hidden from members"}
                  </Label>
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7" title="Upload into this category" onClick={() => pickFile(category.id)}>
                  <Upload className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" title="Rename category" onClick={() => setRenameCat(category)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                {!category.standard_key && (
                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Remove category" onClick={() => setConfirmCat(category)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
            {docs.length === 0 ? (
              <p className="px-3 py-2.5 text-[11px] text-muted-foreground italic">No documents yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {docs.map((doc) => {
                  const seen = isDocumentVisibleToMembers(doc, category);
                  return (
                    <li key={doc.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                      <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                      <button type="button" onClick={() => open(doc)} className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-[13px] hover:underline">{doc.title}</span>
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {new Date(doc.created_at).toLocaleDateString("en-ZA")}
                          {doc.size_bytes ? ` · ${formatFileSize(doc.size_bytes)}` : ""}
                          {doc.members_visible && !category.members_visible ? " · category hidden, so members can't see it" : ""}
                        </span>
                      </button>
                      <Badge variant={seen ? "default" : "outline"} className="h-5 text-[10px] gap-1">
                        {seen ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                        {seen ? "Members see this" : "Admins only"}
                      </Badge>
                      <Switch
                        aria-label="Visible to members"
                        checked={doc.members_visible}
                        onCheckedChange={(v) => run(m.updateDocument.mutateAsync({ id: doc.id, members_visible: v }),
                          v ? "Document shared with members" : "Document hidden from members")}
                      />
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit" onClick={() => setEditDoc(doc)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Remove" onClick={() => setConfirmDoc(doc)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      </div>

      {/* Upload */}
      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload document</DialogTitle>
            <DialogDescription className="text-xs truncate">{draft?.file.name}</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Title</Label>
                <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Category</Label>
                <Select value={draft.categoryId} onValueChange={(v) => setDraft({ ...draft, categoryId: v })}>
                  <SelectTrigger><SelectValue placeholder="Choose a category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="upload-visible" checked={draft.membersVisible}
                  onCheckedChange={(v) => setDraft({ ...draft, membersVisible: v })} />
                <Label htmlFor="upload-visible" className="text-xs font-normal cursor-pointer">Visible to members</Label>
              </div>
              {draft.membersVisible && !categories.find((c) => c.id === draft.categoryId)?.members_visible && (
                <p className="text-[11px] text-muted-foreground">This category is hidden, so members won't see it until the category is made visible.</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
            <Button onClick={doUpload} disabled={m.upload.isPending || !draft?.title.trim() || !draft?.categoryId}>
              {m.upload.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1" />}
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New category */}
      <Dialog open={newCatOpen} onOpenChange={setNewCatOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New category</DialogTitle>
            <DialogDescription className="text-xs">For example "Committee minutes" or "Coaching".</DialogDescription>
          </DialogHeader>
          <Input autoFocus value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="Category name" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCatOpen(false)}>Cancel</Button>
            <Button disabled={!newCatName.trim() || m.addCategory.isPending}
              onClick={async () => { if (await run(m.addCategory.mutateAsync(newCatName), "Category added")) setNewCatOpen(false); }}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename category */}
      <Dialog open={!!renameCat} onOpenChange={(o) => !o && setRenameCat(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Rename category</DialogTitle></DialogHeader>
          {renameCat && (
            <Input autoFocus value={renameCat.name} onChange={(e) => setRenameCat({ ...renameCat, name: e.target.value })} />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameCat(null)}>Cancel</Button>
            <Button disabled={!renameCat?.name.trim() || m.updateCategory.isPending}
              onClick={async () => {
                if (renameCat && await run(m.updateCategory.mutateAsync({ id: renameCat.id, name: renameCat.name.trim() }), "Category renamed")) setRenameCat(null);
              }}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit document */}
      <Dialog open={!!editDoc} onOpenChange={(o) => !o && setEditDoc(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit document</DialogTitle></DialogHeader>
          {editDoc && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Title</Label>
                <Input value={editDoc.title} onChange={(e) => setEditDoc({ ...editDoc, title: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Category</Label>
                <Select value={editDoc.category_id} onValueChange={(v) => setEditDoc({ ...editDoc, category_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDoc(null)}>Cancel</Button>
            <Button disabled={!editDoc?.title.trim() || m.updateDocument.isPending}
              onClick={async () => {
                if (editDoc && await run(m.updateDocument.mutateAsync({ id: editDoc.id, title: editDoc.title.trim(), category_id: editDoc.category_id }), "Document updated")) setEditDoc(null);
              }}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDoc} onOpenChange={(o) => !o && setConfirmDoc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove "{confirmDoc?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>The file is deleted and nobody can open it any more.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDoc && run(m.deleteDocument.mutateAsync(confirmDoc), "Document removed")}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmCat} onOpenChange={(o) => !o && setConfirmCat(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove category "{confirmCat?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>Only empty categories can be removed. Move or remove its documents first.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmCat && run(m.deleteCategory.mutateAsync(confirmCat.id), "Category removed")}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

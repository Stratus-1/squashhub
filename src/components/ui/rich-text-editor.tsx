import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table";
import { Button } from "@/components/ui/button";
import { Bold, Italic, List, ListOrdered, Link2, Heading2, Undo, Redo, Table2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useEffect } from "react";

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  onEditorReady?: (editor: any) => void;
  onFocus?: () => void;
  enableTables?: boolean;
}

export function RichTextEditor({ value, onChange, placeholder, onEditorReady, onFocus, enableTables = false }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: "text-primary underline" } }),
      Placeholder.configure({ placeholder: placeholder || "Write your message…" }),
      ...(enableTables ? [
        Table.configure({ resizable: false, HTMLAttributes: { style: "border-collapse:collapse;width:100%;table-layout:fixed" } }),
        TableRow,
        TableHeader.configure({ HTMLAttributes: { style: "border:1px solid #999;padding:8px;text-align:left;vertical-align:top" } }),
        TableCell.configure({ HTMLAttributes: { style: "border:1px solid #999;padding:8px;vertical-align:top" } }),
      ] : []),
    ],
    content: value || "",
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    onFocus: () => onFocus?.(),
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none min-h-[200px] p-3 focus:outline-none dark:prose-invert [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6 [&_td]:break-words [&_th]:break-words",
      },
    },
  });

  useEffect(() => {
    if (editor) onEditorReady?.(editor);
  }, [editor, onEditorReady]);

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  if (!editor) return null;

  const setLink = () => {
    const url = prompt("Enter URL");
    if (url) editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };
  const controls = [
    { label: "Bold", icon: Bold, active: editor.isActive("bold"), run: () => editor.chain().focus().toggleBold().run() },
    { label: "Italic", icon: Italic, active: editor.isActive("italic"), run: () => editor.chain().focus().toggleItalic().run() },
    { label: "Heading", icon: Heading2, active: editor.isActive("heading", { level: 2 }), run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: "Bullet points", icon: List, active: editor.isActive("bulletList"), run: () => editor.chain().focus().toggleBulletList().run() },
    { label: "Numbered list", icon: ListOrdered, active: editor.isActive("orderedList"), run: () => editor.chain().focus().toggleOrderedList().run() },
    { label: "Insert link", icon: Link2, active: false, run: setLink },
  ];

  return (
    <div className="rounded-md border border-input bg-background">
      <TooltipProvider delayDuration={200}>
      <div className="flex flex-wrap items-center gap-1 border-b border-border p-1" role="toolbar" aria-label="Email formatting">
        {controls.map(({ label, icon: Icon, active, run }) => (
          <Tooltip key={label}><TooltipTrigger asChild>
            <Button type="button" size="icon" aria-label={label} aria-pressed={active} variant={active ? "secondary" : "ghost"} onClick={run}><Icon className="w-3.5 h-3.5" /></Button>
          </TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>
        ))}
        {enableTables && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button type="button" size="icon" variant="ghost" aria-label="Table" title="Table"><Table2 className="w-3.5 h-3.5" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => editor.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run()}>Insert table (3 rows × 2 columns)</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!editor.isActive("table")} onSelect={() => editor.chain().focus().addRowAfter().run()}>Add row below</DropdownMenuItem>
              <DropdownMenuItem disabled={!editor.isActive("table")} onSelect={() => editor.chain().focus().addColumnAfter().run()}>Add column after</DropdownMenuItem>
              <DropdownMenuItem disabled={!editor.isActive("table")} onSelect={() => editor.chain().focus().deleteRow().run()}>Delete row</DropdownMenuItem>
              <DropdownMenuItem disabled={!editor.isActive("table")} onSelect={() => editor.chain().focus().deleteColumn().run()}>Delete column</DropdownMenuItem>
              <DropdownMenuItem disabled={!editor.isActive("table")} onSelect={() => editor.chain().focus().deleteTable().run()}>Delete table</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <div className="ml-auto flex gap-1">
          <Button type="button" size="icon" variant="ghost" title="Undo" aria-label="Undo" onClick={() => editor.chain().focus().undo().run()}><Undo className="w-3.5 h-3.5" /></Button>
          <Button type="button" size="icon" variant="ghost" title="Redo" aria-label="Redo" onClick={() => editor.chain().focus().redo().run()}><Redo className="w-3.5 h-3.5" /></Button>
        </div>
      </div>
      </TooltipProvider>
      <EditorContent editor={editor} />
    </div>
  );
}

export function insertIntoEditor(editor: any, text: string) {
  editor?.chain().focus().insertContent(text).run();
}

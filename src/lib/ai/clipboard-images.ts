export type ClipboardFileItem = {
  kind: string;
  type: string;
  getAsFile: () => File | null;
};

export type ClipboardPayload = {
  files?: ArrayLike<File> | null;
  items?: ArrayLike<ClipboardFileItem> | null;
};

function imageKey(file: File) {
  return `${file.name}:${file.type}:${file.size}:${file.lastModified}`;
}

/**
 * Mobile browsers are inconsistent: desktop Chrome commonly fills `files`,
 * while Samsung Internet/Gboard may expose a pasted image only in `items`.
 */
export function imageFilesFromClipboard(payload?: ClipboardPayload | null): File[] {
  if (!payload) return [];

  const images: File[] = [];
  const seen = new Set<string>();
  const add = (file: File | null) => {
    if (!file || !file.type.startsWith("image/")) return;
    const key = imageKey(file);
    if (seen.has(key)) return;
    seen.add(key);
    images.push(file);
  };

  Array.from(payload.files ?? []).forEach(add);
  Array.from(payload.items ?? []).forEach((item) => {
    if (item.kind === "file") add(item.getAsFile());
  });

  return images;
}

export async function readClipboardImages(clipboard = navigator.clipboard): Promise<File[]> {
  if (!clipboard || typeof clipboard.read !== "function") return [];

  const images: File[] = [];
  const items = await clipboard.read();
  for (const item of items) {
    for (const type of item.types.filter((value) => value.startsWith("image/"))) {
      const blob = await item.getType(type);
      const extension = type.split("/")[1]?.split("+")[0] || "png";
      images.push(new File([blob], `pasted-screenshot-${images.length + 1}.${extension}`, { type }));
    }
  }
  return images;
}
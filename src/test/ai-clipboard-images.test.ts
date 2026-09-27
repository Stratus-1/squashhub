import { describe, expect, it } from "vitest";
import { imageFilesFromClipboard } from "@/lib/ai/clipboard-images";

const image = new File(["image"], "screenshot.png", { type: "image/png", lastModified: 1 });
const text = new File(["hello"], "note.txt", { type: "text/plain", lastModified: 1 });

describe("imageFilesFromClipboard", () => {
  it("reads images exposed through clipboard files", () => {
    expect(imageFilesFromClipboard({ files: [image] })).toEqual([image]);
  });

  it("reads Samsung-style images exposed only through clipboard items", () => {
    expect(imageFilesFromClipboard({
      files: [],
      items: [{ kind: "file", type: "image/png", getAsFile: () => image }],
    })).toEqual([image]);
  });

  it("deduplicates the same image exposed through files and items", () => {
    expect(imageFilesFromClipboard({
      files: [image],
      items: [{ kind: "file", type: "image/png", getAsFile: () => image }],
    })).toEqual([image]);
  });

  it("ignores text and non-image files so ordinary text paste can continue", () => {
    expect(imageFilesFromClipboard({
      files: [text],
      items: [{ kind: "string", type: "text/plain", getAsFile: () => null }],
    })).toEqual([]);
  });
});
import { describe, expect, it } from "vitest";
import { commsDocumentPath, commsDocumentUrl, validCommsDocumentPath } from "@/lib/comms/documents";
import { renderChannel } from "@/lib/comms/render";
import { resolveAction } from "@/lib/comms/actions";
describe("communications document links", () => {
  const club = "11111111-1111-1111-1111-111111111111";
  it("keeps document uploads inside their club and communications folder", () => {
    expect(commsDocumentPath(club, "../Chairman's report.pdf", "test")).toBe(`${club}/comms/test-.._Chairman_s_report.pdf`);
  });
  it("accepts a communications path but rejects other documents and traversal", () => {
    expect(validCommsDocumentPath(`${club}/comms/test-report.pdf`)).toBe(true);
    expect(validCommsDocumentPath(`${club}/rules/report.pdf`)).toBe(false);
    expect(validCommsDocumentPath(`${club}/comms/../report.pdf`)).toBe(false);
  });
  it("preserves multiple document links in the sent email body", () => {
    const paths = ["agenda.pdf", "minutes.pdf"].map((name) => commsDocumentPath(club, name, "test"));
    const urls = paths.map((path) => commsDocumentUrl(path, "https://squashhub.co.za"));
    const body = urls.map((url) => `<p><a href="${url}">Document</a></p>`).join("");
    const rendered = renderChannel("email", { body }, {}, resolveAction({ key: "none" }));
    for (const url of urls) expect(rendered.body).toContain(url);
  });
});
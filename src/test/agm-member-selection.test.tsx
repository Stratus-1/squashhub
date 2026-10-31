import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgmBallotPanel } from "@/components/club-admin/comms/AgmBallotPanel";

const voters = Array.from({ length: 120 }, (_, i) => ({
  club_member_id: `member-${i}`, name: `Member ${i}`, suggested: false,
  has_fee_record: false, email: `member-${i}@example.com`,
}));
const ballot = {
  id: "draft", title: "CSIR AGM", status: "draft", deadline: "2026-11-10T20:00:00Z",
  declaration: "Declaration", nominations_status: "none",
};

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({ data:
    queryKey[0] === "agm-ballots" ? [ballot] :
    queryKey[0] === "agm-voter-candidates" ? voters : [],
  }),
}));
vi.mock("@/lib/comms/send", () => ({ sendComms: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/components/club-admin/comms/AgmTestEmail", () => ({ AgmTestEmail: () => null }));
vi.mock("@/components/club-admin/comms/AgmMeetingCard", () => ({ AgmMeetingCard: () => null }));
vi.mock("@/components/club-admin/comms/AgmNominationsCard", () => ({ AgmNominationsCard: () => null }));

afterEach(cleanup);

function openDraft() {
  render(<AgmBallotPanel clubId="csir" clubName="CSIR" />);
  fireEvent.click(screen.getByRole("button", { name: /CSIR AGM/ }));
}

function memberSelections() {
  return screen.getAllByRole("checkbox").filter((box) =>
    box.closest("label")?.textContent?.startsWith("Member "));
}

describe("AGM bulk member selection", () => {
  it("selects all 120 candidates in one click and still allows individual exclusions", () => {
    openDraft();
    expect(memberSelections().filter((box) => box.getAttribute("aria-checked") === "true")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(memberSelections().filter((box) => box.getAttribute("aria-checked") === "true")).toHaveLength(120);
    fireEvent.click(memberSelections()[0]);
    expect(memberSelections().filter((box) => box.getAttribute("aria-checked") === "true")).toHaveLength(119);
  });

  it("clears all 120 selected members in one click", () => {
    openDraft();
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(memberSelections().filter((box) => box.getAttribute("aria-checked") === "true")).toHaveLength(120);
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(memberSelections().filter((box) => box.getAttribute("aria-checked") === "true")).toHaveLength(0);
  });
});
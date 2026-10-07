import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { BottomNav } from "./BottomNav";

const state = vi.hoisted(() => ({ association: false, bar: true, bookings: true, events: true }));
vi.mock("@/contexts/ClubContext", () => ({ useClubContext: () => ({ club: { tenant_type: state.association ? "association" : "club" } }) }));
vi.mock("@/hooks/use-sidebar-flags", () => ({ useSidebarFlags: () => ({ honestyBarEnabled: state.bar, bookingsEnabled: state.bookings, eventsEnabled: state.events }) }));
afterEach(cleanup);
beforeEach(() => Object.assign(state, { association: false, bar: true, bookings: true, events: true }));
function Location() { return <output aria-label="Current destination">{useLocation().pathname}</output>; }
function mount() { render(<MemoryRouter><BottomNav /><Location /></MemoryRouter>); }

describe("Member bottom shortcuts", () => {
  it("preserves order, routes and unmistakable active state with coloured icons", () => {
    mount();
    expect(screen.getAllByRole("link").map(a => a.textContent)).toEqual(["Home", "Courts", "Bar", "Account", "Profile"]);
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    for (const [label, path, tone] of [["Courts", "/bookings", "courts"], ["Bar", "/honesty-bar", "bar"], ["Account", "/my-account", "account"], ["Profile", "/profile", "profile"]]) {
      const link = screen.getByRole("link", { name: label });
      expect(link).toHaveAttribute("data-tone", tone);
      fireEvent.click(link);
      expect(screen.getByLabelText("Current destination")).toHaveTextContent(path);
      expect(link).toHaveAttribute("aria-current", "page");
    }
  });
  it("never exposes Bar when the existing club applicability flag is off", () => {
    state.bar = false; mount();
    expect(screen.queryByRole("link", { name: "Bar" })).not.toBeInTheDocument();
  });
  it("preserves the Events fallback when Courts is unavailable", () => {
    state.bookings = false; mount();
    expect(screen.queryByRole("link", { name: "Courts" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Events" })).toHaveAttribute("href", "/events");
  });
  it("preserves the association shortcut destinations without member colour scope", () => {
    state.association = true; mount();
    expect(screen.getAllByRole("link").map(a => a.textContent)).toEqual(["Home", "Events", "Leagues", "Account", "Profile"]);
    expect(screen.getByRole("navigation")).not.toHaveClass("member-bottom-nav");
  });
});
import { Component, type ReactNode } from "react";

/** Presentation-only safety net: classic standings survive a failed pilot render. */
export class SwissPilotBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
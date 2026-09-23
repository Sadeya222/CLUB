import { Component, type ReactNode } from "react";
import { LogoMark } from "./Logo";

type State = { failed: boolean };

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(err: unknown) {
    console.error("Meridian Clubs crashed:", err);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-8 text-center">
          <LogoMark className="h-14 w-14" />
          <h1 className="font-display text-2xl font-semibold text-slate-900">
            Something went off course
          </h1>
          <p className="max-w-sm text-sm text-slate-500">
            The concierge desk hit an unexpected error. Reloading usually sets things right —
            your shortlist is saved on this device.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            Reload Meridian Clubs
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

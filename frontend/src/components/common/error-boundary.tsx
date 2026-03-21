import React from "react";

type ErrorBoundaryProps = {
  children: React.ReactNode;
};

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error): void {
    // Keep this minimal in app-level UI; details stay in devtools.
    // eslint-disable-next-line no-console
    console.error("UI render error:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <p className="font-semibold">Something went wrong while rendering this page.</p>
          <p className="mt-1 break-all text-xs">{this.state.error.message}</p>
        </div>
      );
    }

    return this.props.children;
  }
}

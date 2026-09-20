import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
}

/** Keeps one broken screen from blanking the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Swacchify UI error", error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto my-16 max-w-md rounded-card border border-line bg-surface p-8 text-center shadow-soft">
        <p className="mt-3 font-medium">Something went wrong on this screen.</p>
        <p className="mt-1 text-sm text-muted">Please try again. If it keeps happening, go back to the home screen.</p>
        <div className="mt-5 flex justify-center gap-2">
          <button onClick={() => this.setState({ error: null })} className="h-10 rounded-lg bg-brand-700 px-4 text-sm font-medium text-white">
            Try again
          </button>
          <a href="/" className="inline-flex h-10 items-center rounded-lg border border-line-strong px-4 text-sm font-medium">
            Home
          </a>
        </div>
      </div>
    );
  }
}

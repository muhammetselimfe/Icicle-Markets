import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Last line of defence: a render error anywhere below this boundary shows a recoverable
 * message instead of a blank page. Resetting re-mounts the subtree.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="container mx-auto px-4 md:px-6 py-16 flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center mb-5">
          <AlertTriangle className="w-7 h-7 text-red-500" />
        </div>
        <h2 className="text-ice-text font-semibold text-lg mb-2">Something went wrong</h2>
        <p className="text-ice-muted text-sm max-w-md mb-6">
          This page hit an unexpected error. Your funds and wallet are unaffected. Try again, or reload the app.
        </p>
        <pre className="text-ice-faint text-xs font-mono max-w-full overflow-x-auto mb-6 px-3 py-2 rounded-lg bg-ice-surface border border-ice-line/15">
          {this.state.error.message}
        </pre>
        <div className="flex gap-3">
          <button
            onClick={this.reset}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-ice-accent/10 border border-ice-line/30 text-ice-accent hover:bg-ice-accent/20 transition-colors text-sm font-medium"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2.5 rounded-xl bg-ice-surface border border-ice-line/15 text-ice-muted hover:text-ice-text transition-colors text-sm font-medium"
          >
            Reload app
          </button>
        </div>
      </div>
    );
  }
}

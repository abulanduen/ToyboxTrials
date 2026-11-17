import { Component, type ReactNode } from 'react';

/**
 * Last line of defence: if any UI or scene code throws while rendering, show a friendly
 * "came unwound" card with a reload button instead of a blank page.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[Toybox Trials] render error:', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="loading" role="alert">
        <strong style={{ fontSize: '1.4rem' }}>Something came unwound.</strong>
        <span style={{ maxWidth: 420, textAlign: 'center', fontSize: '0.95rem', opacity: 0.85 }}>{this.state.error.message}</span>
        <button className="toy-btn toy-btn--honey" onClick={() => window.location.reload()}>
          <span>Wind it back up</span>
        </button>
      </div>
    );
  }
}

import React from 'react';

interface State { error: Error | null }

export default class ErrorBoundary extends React.Component<
  React.PropsWithChildren,
  State
> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[PetroGraphing] Uncaught render error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100vh',
          background: '#0e0f14', color: '#e2e2e2', fontFamily: 'Inter, sans-serif',
          padding: 40, gap: 16,
        }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#ef4444' }}>
            Something went wrong
          </div>
          <div style={{
            fontSize: 12, color: '#888', background: '#1a1b22',
            borderRadius: 8, padding: '12px 16px', maxWidth: 700,
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            border: '1px solid #333',
          }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              background: '#aa3bff', border: 'none', borderRadius: 6,
              padding: '8px 20px', color: '#fff', fontSize: 13, cursor: 'pointer',
            }}
          >
            Try to recover
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

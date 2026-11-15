import { Component } from "react";

/**
 * Catches a crash in part of the app (for example the map) so it shows a message with a
 * reload button instead of silently disappearing.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(`[MavMap] ${this.props.name || "app"} crashed:`, error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className={`crash-card${this.props.compact ? " crash-card--compact" : ""}`} role="alert">
        <strong>{this.props.title || "Something went wrong."}</strong>
        <span>{String(this.state.error?.message || this.state.error)}</span>
        <div className="crash-actions">
          <button type="button" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
          <button type="button" onClick={() => window.location.reload()}>
            Reload MavMap
          </button>
        </div>
      </div>
    );
  }
}

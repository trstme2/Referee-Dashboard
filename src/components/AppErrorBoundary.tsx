import { Component, type ErrorInfo, type ReactNode } from 'react'

type AppErrorBoundaryProps = {
  children: ReactNode
  resetKey: string
  onError?: (error: Error) => void
}

type AppErrorBoundaryState = {
  hasError: boolean
}

export default class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, _errorInfo: ErrorInfo) {
    this.props.onError?.(error)
  }

  componentDidUpdate(previousProps: AppErrorBoundaryProps) {
    if (this.state.hasError && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <section className="card app-error-boundary" role="alert" aria-live="assertive">
        <p className="eyebrow">Workspace unavailable</p>
        <h2>We could not load this screen.</h2>
        <p className="small">Your saved information is still protected. Reload the app to try again.</p>
        <div className="button-row">
          <button type="button" className="btn primary" onClick={() => window.location.reload()}>Reload Whistle Keeper</button>
          <a className="btn" href="/">Return home</a>
        </div>
      </section>
    )
  }
}

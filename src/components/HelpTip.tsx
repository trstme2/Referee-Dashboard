import type { ReactNode } from 'react'

type HelpTipProps = {
  label?: string
  title: string
  children: ReactNode
  className?: string
}

export default function HelpTip({ label = 'Help me', title, children, className = '' }: HelpTipProps) {
  return (
    <details className={`help-tip ${className}`.trim()}>
      <summary className="help-tip-trigger">
        <span className="pill info">{label}</span>
      </summary>
      <div className="help-tip-panel">
        <strong>{title}</strong>
        <div className="help-tip-body">{children}</div>
      </div>
    </details>
  )
}

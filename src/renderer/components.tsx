import type { ReactNode } from 'react'
import { Check, LoaderCircle, X } from 'lucide-react'

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`vh-panel ${className}`}>{children}</section>
}

export function SectionTitle({ icon, title, subtitle, actions }: { icon?: ReactNode; title: string; subtitle?: string; actions?: ReactNode }) {
  return <div className="section-title"><div className="section-title-main">{icon ? <span className="section-icon">{icon}</span> : null}<div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div></div>{actions ? <div className="section-actions">{actions}</div> : null}</div>
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="form-field"><span>{label}</span>{children}{hint ? <small>{hint}</small> : null}</label>
}

export function Toggle({ checked, onChange, disabled = false, label }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; label?: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={`vh-switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}><i /></button>
}

export function Status({ state, children }: { state: 'online' | 'offline' | 'error' | 'warning'; children: ReactNode }) {
  return <span className={`status-label ${state}`}><i />{children}</span>
}

export function Empty({ title, subtitle }: { title: string; subtitle?: string }) {
  return <div className="empty-state"><div>V</div><strong>{title}</strong>{subtitle ? <p>{subtitle}</p> : null}</div>
}

export function Toast({ type, text }: { type: 'success' | 'error'; text: string }) {
  return <div className={`vh-toast ${type}`}>{type === 'success' ? <Check size={17} /> : <X size={17} />}{text}</div>
}

export function BusyBadge() { return <span className="busy-badge"><LoaderCircle size={15} />处理中</span> }

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

export function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024 ** 3).toFixed(2)} GB`
}

import type { Machine } from '../types'
import './MachineCard.css'

const STATUS_CONFIG: Record<string, { label: string; color: string; cls: string }> = {
  running:     { label: 'Работает',       color: 'var(--c-work)',    cls: 'work' },
  idle:        { label: 'Простой',        color: 'var(--c-idle)',    cls: 'idle' },
  error:       { label: 'Ошибка',         color: 'var(--c-error)',   cls: 'error' },
  maintenance: { label: 'Обслуживание',   color: 'var(--c-service)', cls: 'service' },
  offline:     { label: 'Нет связи',      color: 'var(--text-dim)',  cls: 'offline' },
}

function getStatus(key: string) {
  return STATUS_CONFIG[key] ?? { label: key, color: 'var(--text-dim)', cls: 'unknown' }
}

interface Props {
  machine: Machine
  onClick: () => void
}

export default function MachineCard({ machine, onClick }: Props) {
  const statusKey = machine.online ? machine.status : 'offline'
  const status = getStatus(statusKey)

  return (
    <button
      className={`card status-${status.cls} ${!machine.online ? 'is-offline' : ''}`}
      onClick={onClick}
      style={{ '--status-color': status.color } as React.CSSProperties}
    >
      <div className="card-edge" />

      <div className="card-top">
        <span className="card-code">№{machine.machine_id}</span>
        <span className="card-radar" aria-hidden="true">
          <span className="card-radar-ring" />
          <span className="card-radar-dot" />
        </span>
      </div>

      <h3 className="card-name">{machine.name}</h3>
      {machine.type && <p className="card-type">{machine.type}</p>}

      <div className="card-status-row">
        <span className="card-status-pill">{status.label}</span>
      </div>

      <time className="card-time">{machine.timestamp}</time>
    </button>
  )
}

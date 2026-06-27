import { useEffect, useState } from 'react'
import { Routes, Route, useNavigate } from 'react-router-dom'
import type { Machine } from './types'
import MachineCard from './components/MachineCard'
import MachinePage from './pages/MachinePage'
import './App.css'

const POLL_MS = 5000

function Dashboard() {
  const [machines, setMachines] = useState<Machine[]>([])
  const [connected, setConnected] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/machines')
        const data: Machine[] = await res.json()
        setMachines(data ?? [])
        setConnected(true)
      } catch {
        setConnected(false)
      }
    }
    poll()
    const id = setInterval(poll, POLL_MS)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <span className="app-title-mark">ЦЕХ</span>
          <span className="app-title-sep">/</span>
          <span className="app-title-sub">Мониторинг станков</span>
        </div>
        <div className={`conn-pill ${connected ? 'is-on' : 'is-off'}`}>
          <span className="conn-dot" />
          {connected ? 'подключено' : 'нет связи'}
        </div>
      </header>

      {machines.length === 0 ? (
        <div className="app-empty">
          <div className="app-empty-icon">⏳</div>
          <p>Ожидание подключения станков...</p>
          <p className="app-empty-hint">Отправьте POST на /api/machine-status</p>
        </div>
      ) : (
        <>
          <p className="app-hint">Нажмите на карточку для просмотра детальной аналитики</p>
          <main className="grid">
            {machines.map((m) => (
              <MachineCard
                key={m.machine_id}
                machine={m}
                onClick={() => navigate(`/machine/${m.machine_id}`)}
              />
            ))}
          </main>
        </>
      )}
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/machine/:id" element={<MachinePage />} />
    </Routes>
  )
}

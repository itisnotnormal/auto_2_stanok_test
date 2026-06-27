import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Machine } from '../types'

type Status = 'work' | 'idle' | 'error' | 'offline'

function toStatus(m: Machine): Status {
  if (!m.online) return 'offline'
  switch (m.status) {
    case 'running': case 'auc':              return 'work'
    case 'alarm':   case 'error':            return 'error'
    case 'idle':    case 'setup': case 'dt': return 'idle'
    default:                                 return 'idle'
  }
}

type Theme = 'day' | 'night'

interface Pal {
  bgGrad: string; grid: string
  text: string; textMuted: string; textDim: string
  cardBg: string; cardBgOff: string; cardBorder: string; track: string
  iconStroke: string
  serverBg: string; serverBorder: string; serverText: string; serverIcon: string
  pulseRing: string
  btnBg: string; btnBorder: string; btnHover: string
  status: Record<Status, string>
  tint: Record<Status, string>
  note: { idle: string; error: string; offline: string }
}

function pal(t: Theme): Pal {
  if (t === 'night') return {
    bgGrad: 'radial-gradient(130% 100% at 50% 40%, #1d2431 0%, #161b25 55%, #11151d 100%)',
    grid: 'rgba(150,170,200,.05)',
    text: '#e7ebf1', textMuted: '#9aa6b6', textDim: '#6b7686',
    cardBg: '#222a36', cardBgOff: '#1c232d', cardBorder: '#323b48', track: '#2c3542',
    iconStroke: '#9aa6b6',
    serverBg: 'linear-gradient(165deg,#2c3644,#212935)', serverBorder: '#3a4554', serverText: '#eef1f5', serverIcon: '#aab6c4',
    pulseRing: 'rgba(150,170,200,.16)',
    btnBg: '#222a36', btnBorder: '#323b48', btnHover: '#2b3440',
    status: { work: '#34c47d', idle: '#e0a93a', error: '#ec5d57', offline: '#7f8a99' },
    tint: { work: 'rgba(52,196,125,.16)', idle: 'rgba(224,169,58,.16)', error: 'rgba(236,93,87,.18)', offline: 'rgba(127,138,153,.16)' },
    note: { idle: '#e7bd66', error: '#f08a85', offline: '#9aa6b6' },
  }
  return {
    bgGrad: 'radial-gradient(130% 100% at 50% 40%, #f6f7f9 0%, #eef0f3 55%, #e7eaee 100%)',
    grid: 'rgba(40,55,80,.04)',
    text: '#222a36', textMuted: '#6b7480', textDim: '#9aa3ad',
    cardBg: '#ffffff', cardBgOff: '#f6f7f8', cardBorder: '#e3e6ea', track: '#eceef1',
    iconStroke: '#5b6470',
    serverBg: 'linear-gradient(165deg,#323c49,#262e39)', serverBorder: '#1c232c', serverText: '#eef1f5', serverIcon: '#cfd6df',
    pulseRing: 'rgba(43,52,64,.18)',
    btnBg: '#ffffff', btnBorder: '#e3e6ea', btnHover: '#f3f4f6',
    status: { work: '#1f9d57', idle: '#c98a1b', error: '#d6453f', offline: '#9aa3ad' },
    tint: { work: '#e8f5ee', idle: '#fbf2e0', error: '#fbe9e8', offline: '#eef0f2' },
    note: { idle: '#a06d10', error: '#c0392f', offline: '#8a929e' },
  }
}

const S = (o: Record<string, string | number>) => o as unknown as React.CSSProperties

const CX = 800, CY = 470, RX = 620, RY = 384

function RackIcon({ size, stroke, style }: { size: number; stroke: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke}
         strokeWidth="1.6" strokeLinecap="round" style={style} aria-hidden="true">
      <rect x="3.5" y="4" width="17" height="6.4" rx="1.8" />
      <rect x="3.5" y="13.6" width="17" height="6.4" rx="1.8" />
      <circle cx="7" cy="7.2" r="1" /><circle cx="7" cy="16.8" r="1" />
      <line x1="11" y1="7.2" x2="17" y2="7.2" />
      <line x1="11" y1="16.8" x2="17" y2="16.8" />
    </svg>
  )
}

export default function TopologyDashboard() {
  const navigate = useNavigate()
  const [theme, setTheme] = useState<Theme>('day')
  const [scale, setScale] = useState(1)
  const [tick, setTick] = useState(0)
  const [hovered, setHovered] = useState<number | null>(null)
  const [apiMachines, setApiMachines] = useState<Machine[]>([])

  useEffect(() => {
    let saved: Theme = 'day'
    try { saved = (localStorage.getItem('cnc-theme') as Theme) || 'day' } catch { /* ignore */ }
    setTheme(saved)
  }, [])

  useEffect(() => {
    const resize = () => setScale(Math.min(window.innerWidth / 1600, (window.innerHeight - 60) / 940))
    resize()
    window.addEventListener('resize', resize)
    const timer = setInterval(() => setTick(t => t + 1), 1500)
    return () => { window.removeEventListener('resize', resize); clearInterval(timer) }
  }, [])

  useEffect(() => {
    const load = () =>
      fetch('/api/machines')
        .then(r => r.json())
        .then((data: Machine[]) => setApiMachines(data ?? []))
        .catch(() => {})
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [])

  const isDay = theme !== 'night'
  const T = pal(theme)

  const toggleTheme = () => {
    setTheme(prev => {
      const next: Theme = prev === 'night' ? 'day' : 'night'
      try { localStorage.setItem('cnc-theme', next) } catch { /* ignore */ }
      return next
    })
  }

  const counts = { total: apiMachines.length, work: 0, idle: 0, error: 0, offline: 0 }
  apiMachines.forEach(m => { counts[toStatus(m)]++ })

  const machines = apiMachines.map((m, i) => {
    const ang = (-90 + i * 30) * Math.PI / 180
    const x = CX + RX * Math.cos(ang)
    const y = CY + RY * Math.sin(ang)
    const st      = toStatus(m)
    const color   = T.status[st]
    const tint    = T.tint[st]
    const isWork    = st === 'work'
    const isError   = st === 'error'
    const isOffline = st === 'offline'
    const displayLoad = isWork
      ? Math.max(8, Math.min(99, Math.round(tick * 0 + 60 + 6 * Math.sin(tick * 0.7 + i))))
      : null
    return { ...m, i, st, x, y, color, tint, isWork, isError, isOffline, displayLoad }
  })

  return (
    <div style={S({
      position: 'fixed', inset: 0, overflow: 'hidden', background: T.bgGrad, color: T.text,
      fontFamily: "'Space Grotesk', system-ui, sans-serif",
      '--text': T.text, '--text-muted': T.textMuted, '--text-dim': T.textDim,
      '--c-work': T.status.work, '--c-idle': T.status.idle, '--c-error': T.status.error, '--c-offline': T.status.offline,
      '--icon-stroke': T.iconStroke, '--track': T.track,
      '--server-bg': T.serverBg, '--server-border': T.serverBorder, '--server-text': T.serverText, '--server-icon': T.serverIcon,
      '--pulse-ring': T.pulseRing, '--btn-bg': T.btnBg, '--btn-border': T.btnBorder, '--btn-hover': T.btnHover,
    })}>
      <style>{CSS}</style>

      {/* сетка */}
      <div style={S({ position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `linear-gradient(${T.grid} 1px,transparent 1px),linear-gradient(90deg,${T.grid} 1px,transparent 1px)`,
        backgroundSize: '54px 54px' })} />

      {/* заголовок */}
      <div style={{ position: 'absolute', top: 30, left: 46, zIndex: 30, display: 'flex', alignItems: 'baseline', gap: 13, whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 27, fontWeight: 700, letterSpacing: '.02em', color: T.text }}>ЦЕХ</span>
        <span style={{ fontSize: 19, fontWeight: 500, color: T.textMuted }}>/&nbsp;&nbsp;Карта станков</span>
        <span style={{ marginLeft: 8, fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: T.textDim, letterSpacing: '.08em' }}>обновлено в реальном времени</span>
      </div>

      {/* легенда */}
      <div style={{ position: 'absolute', top: 30, right: 46, zIndex: 30, display: 'flex', alignItems: 'center', gap: 20, fontSize: 13, color: T.textMuted }}>
        {(['work', 'idle', 'error', 'offline'] as Status[]).map(s => (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: T.status[s], flexShrink: 0 }} />
            {s === 'work' ? 'Работа' : s === 'idle' ? 'Простой' : s === 'error' ? 'Авария' : 'Нет связи'}
          </div>
        ))}
      </div>

      {/* счётчики */}
      <div style={{ position: 'absolute', top: 68, left: 46, zIndex: 30, display: 'flex', gap: 16, fontFamily: 'JetBrains Mono,monospace', fontSize: 12, color: T.textDim }}>
        <span><b style={{ color: T.text, fontWeight: 500 }}>{counts.total}</b> станков</span>
        <span style={{ color: T.status.work }}>{counts.work} работа</span>
        <span style={{ color: T.status.idle }}>{counts.idle} простой</span>
        <span style={{ color: T.status.error }}>{counts.error} авария</span>
        <span style={{ color: T.status.offline }}>{counts.offline} офлайн</span>
      </div>

      {/* сцена */}
      <div style={S({ position: 'absolute', left: '50%', top: '50%', width: '1600px', height: '940px', transform: `translate(-50%,-50%) scale(${scale})` })}>

        {/* линии + пакеты */}
        <svg width="1600" height="940" style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
          {machines.map(m => {
            const speed = m.isWork ? 2.0 : m.isError ? 1.6 : 3.4
            const ls: React.CSSProperties = m.isOffline
              ? { strokeWidth: 1.4, opacity: .18, strokeDasharray: '2 8' }
              : { strokeWidth: 1.6, strokeDasharray: '4 9', opacity: isDay ? .4 : .5, strokeLinecap: 'round', animation: `dashFlow ${speed}s linear infinite` }
            return <line key={m.i} x1={m.x} y1={m.y} x2={CX} y2={CY} stroke={m.color} style={ls} />
          })}
          {machines.flatMap(m => {
            if (m.isOffline) return []
            const dur = m.isWork ? 2.6 : m.isError ? 2.0 : 4.0
            const pp = `path("M ${m.x} ${m.y} L ${CX} ${CY}")`
            return [0, dur / 2].map((d, k) => (
              <circle key={`${m.i}-${k}`} r="3.2" fill={m.color}
                style={S({ offsetPath: pp, offsetRotate: '0deg', animation: `packetMove ${dur}s linear infinite`, animationDelay: `${d}s` })} />
            ))
          })}
        </svg>

        {/* пульс сервера */}
        <div style={{ position: 'absolute', left: 800, top: 470, width: 2, height: 2 }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: 188, height: 188, border: `1.5px solid ${T.pulseRing}`, borderRadius: 26, animation: 'softPulse 4s ease-out infinite' }} />
        </div>

        {/* сервер */}
        <div style={{ position: 'absolute', left: 800, top: 470, transform: 'translate(-50%,-50%)', zIndex: 6, width: 180, height: 180, borderRadius: 26, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 11, background: T.serverBg, border: `1px solid ${T.serverBorder}`, boxShadow: '0 10px 30px rgba(20,28,40,.22), inset 0 1px 0 rgba(255,255,255,.06)' }}>
          <RackIcon size={46} stroke={T.serverIcon} />
          <div style={{ fontSize: 13, letterSpacing: '.16em', color: T.serverText, fontWeight: 600 }}>СЕРВЕР</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: '#9fb6a6' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3fcf82', flexShrink: 0 }} />
            {counts.total - counts.offline} / {counts.total} на связи
          </div>
        </div>

        {/* станки */}
        {machines.map(m => {
          const isHov = hovered === m.i
          return (
            <div key={m.i}
              style={{ position: 'absolute', left: m.x, top: m.y, transform: 'translate(-50%,-50%)', cursor: 'pointer', zIndex: 5 }}
              onClick={() => navigate(`/machine/${m.i + 1}`)}
              onMouseEnter={() => setHovered(m.i)}
              onMouseLeave={() => setHovered(h => h === m.i ? null : h)}>
              <div style={{
                width: 168, height: 168, borderRadius: 16, padding: 16,
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                background: m.isOffline ? T.cardBgOff : T.cardBg,
                border: `1px solid ${T.cardBorder}`, borderLeft: `3px solid ${m.color}`,
                opacity: m.isOffline ? .72 : 1,
                transform: isHov ? 'translateY(-5px)' : 'none',
                boxShadow: isHov ? '0 14px 30px rgba(16,24,40,.18)' : '0 1px 2px rgba(16,24,40,.05), 0 6px 16px rgba(16,24,40,.06)',
                transition: 'transform .18s ease, box-shadow .22s ease',
              }}>
                {/* верх */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <RackIcon size={32} stroke={T.iconStroke} style={{ opacity: m.isOffline ? .5 : .9 }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 11, height: 11, borderRadius: '50%', background: m.color, boxShadow: `0 0 0 3px ${m.tint}`, flexShrink: 0 }} />
                  </div>
                </div>
                {/* имя */}
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: T.text, letterSpacing: '.005em' }}>{m.name}</div>
                  <div style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: T.textDim, marginTop: 2 }}>№{m.machine_id}</div>
                </div>
                {/* статус */}
                <div>
                  {m.isWork ? (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                        <span style={{ fontSize: 10, letterSpacing: '.06em', color: T.textDim, textTransform: 'uppercase' }}>Загрузка</span>
                        <span style={{ fontFamily: 'JetBrains Mono,monospace', fontSize: 13, fontWeight: 500, color: m.color }}>{m.displayLoad}%</span>
                      </div>
                      <div style={{ height: 5, borderRadius: 3, background: T.track, overflow: 'hidden' }}>
                        <div style={{ width: `${m.displayLoad ?? 0}%`, height: '100%', background: m.color, borderRadius: 3, transition: 'width .6s ease' }} />
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12.5, lineHeight: 1.35, fontWeight: 500,
                      color: m.isError ? T.note.error : m.isOffline ? T.note.offline : T.note.idle }}>{m.type}</div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* кнопка день/ночь — снизу справа */}
      <div onClick={toggleTheme} className="km-theme-btn"
        style={{ position: 'absolute', bottom: 28, right: 36, zIndex: 40,
          display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px',
          borderRadius: 999, background: T.btnBg, border: `1px solid ${T.btnBorder}`,
          color: T.textMuted, cursor: 'pointer', fontSize: 13, fontWeight: 500,
          userSelect: 'none', boxShadow: '0 4px 16px rgba(20,28,40,.14)',
          transition: 'background .15s ease' }}>
        {isDay ? (
          <>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
            <span>Ночь</span>
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="12" cy="12" r="4" />
              <line x1="12" y1="2.5" x2="12" y2="5" /><line x1="12" y1="19" x2="12" y2="21.5" />
              <line x1="2.5" y1="12" x2="5" y2="12" /><line x1="19" y1="12" x2="21.5" y2="12" />
              <line x1="5.3" y1="5.3" x2="7" y2="7" /><line x1="17" y1="17" x2="18.7" y2="18.7" />
              <line x1="18.7" y1="5.3" x2="17" y2="7" /><line x1="7" y1="17" x2="5.3" y2="18.7" />
            </svg>
            <span>День</span>
          </>
        )}
      </div>
    </div>
  )
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
@keyframes dashFlow   { to { stroke-dashoffset: -14; } }
@keyframes packetMove { 0% { offset-distance:0%; opacity:0; } 14% { opacity:1; } 86% { opacity:1; } 100% { offset-distance:100%; opacity:0; } }
@keyframes softPulse  { 0%,100% { transform:translate(-50%,-50%) scale(1); opacity:.5; } 50% { transform:translate(-50%,-50%) scale(1.5); opacity:0; } }
.km-theme-btn:hover { filter: brightness(1.05); }
`

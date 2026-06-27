import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  PieChart, Pie, Legend, Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { Machine, LogEntry } from '../types'
import './MachinePage.css'

type Period = 'day' | 'week' | 'year' | 'all'

const PERIODS: { key: Period; label: string }[] = [
  { key: 'day',  label: 'День' },
  { key: 'week', label: 'Неделя' },
  { key: 'year', label: 'Год' },
  { key: 'all',  label: 'Всё время' },
]

const STATUS_COLOR: Record<string, string> = {
  running: '#2ed573',
  error:   '#ff4757',
  offline: '#3a3f4b',
}
const STATUS_LABEL: Record<string, string> = {
  running: 'Работает',
  error:   'Ошибка',
  offline: 'Офлайн',
}
const STATUS_ORDER = ['running', 'error', 'offline'] as const

interface ChartPoint {
  time: number
  status: string
  timestamp: string
}

interface TimelineSegment {
  x1: number
  x2: number
  status: string
  color: string
  leftPct: number
  widthPct: number
}

interface PieSlice {
  name: string; value: number; pct: number; color: string
}

function dedupe(events: LogEntry[]): LogEntry[] {
  const out: LogEntry[] = []
  for (const e of events) {
    if (!out.length || out[out.length - 1].status !== e.status) out.push(e)
  }
  return out
}

function toChartData(events: LogEntry[]): ChartPoint[] {
  return dedupe([...events].reverse()).map(e => ({
    time: new Date(e.timestamp).getTime(),
    status: e.status,
    timestamp: e.timestamp,
  }))
}

function buildTimeline(data: ChartPoint[]) {
  if (!data.length) return { segments: [] as TimelineSegment[], rangeStart: 0, rangeEnd: 0 }
  const rangeStart = data[0].time
  const rangeEnd   = Date.now()
  const total      = Math.max(rangeEnd - rangeStart, 1)

  const segments: TimelineSegment[] = data.map((p, i) => {
    const x1 = p.time
    const x2 = i < data.length - 1 ? data[i + 1].time : rangeEnd
    return {
      x1, x2,
      status: p.status,
      color:  STATUS_COLOR[p.status] || '#444',
      leftPct:  ((x1 - rangeStart) / total) * 100,
      widthPct: Math.max(((x2 - x1) / total) * 100, 0.2),
    }
  })

  return { segments, rangeStart, rangeEnd }
}

function buildTicks(rangeStart: number, rangeEnd: number, period: Period, count = 6) {
  if (rangeEnd <= rangeStart) return []
  return Array.from({ length: count }, (_, i) => {
    const t = rangeStart + (rangeEnd - rangeStart) * (i / (count - 1))
    return { pct: (i / (count - 1)) * 100, label: tickTime(t, period) }
  })
}

function calcPie(events: LogEntry[]): PieSlice[] {
  if (!events.length) return []
  const sorted = [...events].reverse()
  const now    = Date.now()
  const dur: Record<string, number> = {}
  for (let i = 0; i < sorted.length; i++) {
    const start = new Date(sorted[i].timestamp).getTime()
    const end   = i < sorted.length - 1 ? new Date(sorted[i + 1].timestamp).getTime() : now
    const s     = sorted[i].status
    dur[s] = (dur[s] || 0) + Math.max(0, end - start)
  }
  const total = Object.values(dur).reduce((a, b) => a + b, 0)
  return Object.entries(dur)
    .sort((a, b) => b[1] - a[1])
    .map(([status, ms]) => ({
      name:  STATUS_LABEL[status] || status,
      value: ms,
      pct:   total > 0 ? Math.round((ms / total) * 100) : 0,
      color: STATUS_COLOR[status] || '#666',
    }))
}

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}с`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}м ${s % 60}с`
  return `${Math.floor(m / 60)}ч ${m % 60}м`
}

function tickTime(ts: number, period: Period) {
  const d = new Date(ts)
  if (period === 'day')  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  if (period === 'week') return d.toLocaleDateString('ru-RU', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}

function tooltipTime(ts: number) {
  return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function MachinePage() {
  const { id }       = useParams<{ id: string }>()
  const navigate     = useNavigate()
  const [machine, setMachine]   = useState<Machine | null>(null)
  const [events, setEvents]     = useState<LogEntry[]>([])
  const [period, setPeriod]     = useState<Period>('day')
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  useEffect(() => {
    const load = () =>
      fetch('/api/machines').then(r => r.json())
        .then((ms: Machine[]) => setMachine(ms.find(m => m.machine_id === Number(id)) ?? null))
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [id])

  useEffect(() => {
    const load = () =>
      fetch(`/api/machine-status?machine_id=${id}&period=${period}`)
        .then(r => r.json())
        .then((d: LogEntry[]) => setEvents(d ?? []))
    load()
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [id, period])

  const chartData                          = toChartData(events)
  const { segments, rangeStart, rangeEnd } = buildTimeline(chartData)
  const ticks                              = buildTicks(rangeStart, rangeEnd, period)
  const pieData                            = calcPie(events)
  const curStatus = machine ? (machine.online ? machine.status : 'offline') : null
  const curColor  = STATUS_COLOR[curStatus ?? ''] ?? '#555'
  const hovered   = hoverIdx !== null ? segments[hoverIdx] : null
  const tooltipPct = hovered
    ? Math.min(Math.max(hovered.leftPct + hovered.widthPct / 2, 6), 94)
    : 0

  return (
    <div className="mp">

      {/* шапка */}
      <div className="mp-topbar">
        <button className="mp-back" onClick={() => navigate('/')}>← Назад</button>
        {machine && <h1 className="mp-name">{machine.name}</h1>}
        {curStatus && (
          <span className="mp-badge" style={{ background: `${curColor}1a`, color: curColor }}>
            {STATUS_LABEL[curStatus] ?? curStatus}
          </span>
        )}
      </div>

      {/* период */}
      <div className="mp-periods">
        {PERIODS.map(p => (
          <button
            key={p.key}
            className={`mp-period-btn ${period === p.key ? 'is-active' : ''}`}
            onClick={() => setPeriod(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <section className="mp-card">
        <h2 className="mp-card-title">График статусов</h2>
        {segments.length === 0 ? (
          <div className="mp-empty">Недостаточно данных за выбранный период</div>
        ) : (
          <div className="mp-timeline-wrap">
            {hovered && (
              <div className="mp-timeline-tooltip" style={{ left: `${tooltipPct}%` }}>
                <div className="mp-tt-status" style={{ color: hovered.color }}>
                  {STATUS_LABEL[hovered.status] || hovered.status}
                </div>
                <div className="mp-tt-time">
                  {tooltipTime(hovered.x1)} –{' '}
                  {hovered.x2 >= Date.now() - 2000 ? 'сейчас' : tooltipTime(hovered.x2)}
                </div>
                <div className="mp-tt-dur">{formatDuration(hovered.x2 - hovered.x1)}</div>
              </div>
            )}

            <div className="mp-timeline-track">
              {segments.map((seg, i) => (
                <div
                  key={i}
                  className={`mp-timeline-seg ${i === segments.length - 1 ? 'is-current' : ''}`}
                  style={{ left: `${seg.leftPct}%`, width: `${seg.widthPct}%`, background: seg.color }}
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(null)}
                />
              ))}
            </div>

            <div className="mp-timeline-axis">
              {ticks.map((t, i) => (
                <span key={i} style={{ left: `${t.pct}%` }}>{t.label}</span>
              ))}
            </div>

            <div className="mp-timeline-legend">
              {STATUS_ORDER.map(s => (
                <span key={s} className="mp-timeline-legend-item">
                  <span className="mp-timeline-legend-dot" style={{ background: STATUS_COLOR[s] }} />
                  {STATUS_LABEL[s]}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Pie + Stats */}
      <div className="mp-bottom">
        <section className="mp-card mp-pie-card">
          <h2 className="mp-card-title">Распределение</h2>
          {pieData.length === 0 ? (
            <div className="mp-empty">Нет данных</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData.map(d => ({ ...d, fill: d.color }))}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={88}
                  paddingAngle={3}
                  dataKey="value"
                  strokeWidth={0}
                />
                <Tooltip
                  formatter={(val, _, props) => {
                    const s = (props as { payload: PieSlice }).payload
                    return [`${s.pct}% · ${formatDuration(Number(val))}`, s.name]
                  }}
                  contentStyle={{ background: '#12161d', border: '1px solid #1e2630', borderRadius: 6, fontSize: 12 }}
                  itemStyle={{ color: '#c9d1d9' }}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={v => <span style={{ color: '#8b949e', fontSize: 12 }}>{v}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className="mp-card mp-stats-card">
          <h2 className="mp-card-title">Аналитика</h2>
          <div className="mp-stats">
            {pieData.map(s => (
              <div className="mp-stat-row" key={s.name}>
                <span className="mp-stat-dot" style={{ background: s.color }} />
                <span className="mp-stat-label">{s.name}</span>
                <span className="mp-stat-pct" style={{ color: s.color }}>{s.pct}%</span>
                <span className="mp-stat-dur">{formatDuration(s.value)}</span>
              </div>
            ))}
            <div className="mp-stat-divider" />
            <div className="mp-stat-row">
              <span className="mp-stat-label" style={{ color: '#6b7686' }}>Событий за период</span>
              <span className="mp-stat-pct" style={{ color: '#e8edf2' }}>{events.length}</span>
            </div>
          </div>
        </section>
      </div>

      {/* Log */}
      <section className="mp-card">
        <h2 className="mp-card-title">Последние события</h2>
        <div className="mp-log">
          {events.slice(0, 30).map((e, i) => (
            <div className="mp-log-row" key={i}>
              <span className="mp-log-time">{e.timestamp}</span>
              <span className="mp-log-status" style={{ color: STATUS_COLOR[e.status] || '#888' }}>
                {STATUS_LABEL[e.status] || e.status}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

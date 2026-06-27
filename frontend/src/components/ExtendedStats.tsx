import { useMemo, useState } from 'react'
import './ExtendedStats.css'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import type { Machine, LogEntry } from '../types'

/* «Интеллектуальные» статусы — расширяемая карта.
   Значения с бэка (running/error/offline/idle/...) тоже учитываются. */
const STATUS_META: Record<string, { label: string; color: string; group: 'work' | 'stop' | 'error' | 'off' }> = {
  running: { label: 'AuC · Под нагрузкой', color: '#2ed573', group: 'work' },
  auc:     { label: 'AuC · Под нагрузкой', color: '#2ed573', group: 'work' },
  idle:    { label: 'IDL · Холостой ход',  color: '#ffa502', group: 'stop' },
  setup:   { label: 'SET · Наладка',        color: '#748ffc', group: 'stop' },
  dt:      { label: 'DT · Простой',         color: '#8d5524', group: 'stop' },
  alarm:   { label: 'ALM · Авария',         color: '#ff4757', group: 'error' },
  error:   { label: 'ALM · Авария',         color: '#ff4757', group: 'error' },
  offline: { label: 'OFF · Нет связи',      color: '#3a3f4b', group: 'off' },
}

function meta(status: string) {
  return STATUS_META[status] ?? { label: status.toUpperCase(), color: '#6b7686', group: 'stop' as const }
}

interface Agg {
  status: string
  label: string
  color: string
  ms: number
  pct: number
  transitions: number
}

function formatDuration(ms: number) {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}с`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}м ${s % 60}с`
  const h = Math.floor(m / 60)
  return `${h}ч ${m % 60}м`
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

/* агрегируем длительность и количество переходов по статусам */
function aggregate(events: LogEntry[]): Agg[] {
  if (!events.length) return []
  const sorted = [...events].reverse()
  const now = Date.now()
  const dur: Record<string, number> = {}
  const trans: Record<string, number> = {}
  for (let i = 0; i < sorted.length; i++) {
    const start = new Date(sorted[i].timestamp).getTime()
    const end = i < sorted.length - 1 ? new Date(sorted[i + 1].timestamp).getTime() : now
    const s = sorted[i].status
    dur[s] = (dur[s] || 0) + Math.max(0, end - start)
    trans[s] = (trans[s] || 0) + 1
  }
  const total = Object.values(dur).reduce((a, b) => a + b, 0)
  return Object.entries(dur)
    .sort((a, b) => b[1] - a[1])
    .map(([status, ms]) => ({
      status,
      label: meta(status).label,
      color: meta(status).color,
      ms,
      pct: total > 0 ? Math.round((ms / total) * 100) : 0,
      transitions: trans[status] || 0,
    }))
}

/* накопленное время (мин) в каждом статусе по времени — «ценовой» график */
function buildCumulative(events: LogEntry[], statuses: string[]) {
  if (events.length < 1) return [] as Record<string, number>[]
  const sorted = [...events].reverse()
  const now = Date.now()
  const cum: Record<string, number> = {}
  statuses.forEach(s => { cum[s] = 0 })
  const points: Record<string, number>[] = []
  const first = new Date(sorted[0].timestamp).getTime()
  points.push({ t: first, ...cum })
  for (let i = 0; i < sorted.length; i++) {
    const start = new Date(sorted[i].timestamp).getTime()
    const end = i < sorted.length - 1 ? new Date(sorted[i + 1].timestamp).getTime() : now
    cum[sorted[i].status] = (cum[sorted[i].status] || 0) + Math.max(0, end - start) / 60000
    points.push({ t: end, ...statuses.reduce((o, s) => { o[s] = Math.round((cum[s] || 0) * 10) / 10; return o }, {} as Record<string, number>) })
  }
  return points
}

interface Props {
  machine: Machine | null
  events: LogEntry[]
  onClose: () => void
}

export default function ExtendedStats({ machine, events, onClose }: Props) {
  const agg = useMemo(() => aggregate(events), [events])
  const statuses = useMemo(() => agg.map(a => a.status), [agg])
  const series = useMemo(() => buildCumulative(events, statuses), [events, statuses])

  const [hover, setHover] = useState<string | null>(null)
  const [solo, setSolo] = useState<string | null>(null)

  const errorsCount = agg.filter(a => meta(a.status).group === 'error').reduce((s, a) => s + a.transitions, 0)
  const stopsCount = agg.filter(a => meta(a.status).group === 'stop' || meta(a.status).group === 'off').reduce((s, a) => s + a.transitions, 0)
  const totalTransitions = agg.reduce((s, a) => s + a.transitions, 0)

  /* активное выделение: solo приоритетнее hover */
  const active = solo ?? hover
  const isDimmed = (status: string) => active != null && active !== status

  const pieData = solo ? agg.filter(a => a.status === solo) : agg

  const toggleSolo = (status: string) => setSolo(prev => (prev === status ? null : status))

  return (
    <div className="xs-overlay" onClick={onClose}>
      <div className="xs-modal" onClick={(e) => e.stopPropagation()}>
        <div className="xs-head">
          <h2 className="xs-title">
            Расширенная статистика
            {machine && <span className="xs-sub">{machine.name} · {machine.type}</span>}
          </h2>
          <button className="xs-close" onClick={onClose} aria-label="Закрыть">✕</button>
        </div>

        <div className="xs-body">
          {/* сводка */}
          <div className="xs-counts">
            <div className="xs-count">
              <span className="xs-count-num" style={{ color: '#ff4757' }}>{errorsCount}</span>
              <span className="xs-count-lbl">аварий</span>
            </div>
            <div className="xs-count">
              <span className="xs-count-num" style={{ color: '#ffa502' }}>{stopsCount}</span>
              <span className="xs-count-lbl">остановок / простоев</span>
            </div>
            <div className="xs-count">
              <span className="xs-count-num">{totalTransitions}</span>
              <span className="xs-count-lbl">переходов всего</span>
            </div>
            <div className="xs-count">
              <span className="xs-count-num">{events.length}</span>
              <span className="xs-count-lbl">событий за период</span>
            </div>
          </div>

          {/* интерактивная легенда-фильтр */}
          <div className="xs-chips">
            {agg.map(a => (
              <button
                key={a.status}
                className={`xs-chip ${solo === a.status ? 'is-solo' : ''} ${isDimmed(a.status) ? 'is-dim' : ''}`}
                style={{ ['--chip' as string]: a.color }}
                onMouseEnter={() => setHover(a.status)}
                onMouseLeave={() => setHover(h => (h === a.status ? null : h))}
                onClick={() => toggleSolo(a.status)}
              >
                <span className="xs-chip-dot" style={{ background: a.color }} />
                {a.label}
                <b className="xs-chip-cnt">×{a.transitions}</b>
              </button>
            ))}
            {solo && (
              <button className="xs-chip xs-chip-reset" onClick={() => setSolo(null)}>✕ сбросить фильтр</button>
            )}
          </div>

          {/* большой график */}
          <section className="xs-card xs-card-wide">
            <h3 className="xs-card-title">
              Накопленное время по статусам (мин)
              <span className="xs-hint">наведите — подсветить · клик — оставить только один статус</span>
            </h3>
            {series.length < 2 ? (
              <div className="xs-empty">Недостаточно данных за период</div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={series} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                  <CartesianGrid stroke="#1e2630" strokeDasharray="3 3" />
                  <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']}
                         tickFormatter={(t) => fmtTime(Number(t))} stroke="#45505f" fontSize={10}
                         tickLine={false} minTickGap={48} />
                  <YAxis stroke="#45505f" fontSize={10} tickLine={false} width={42} />
                  <Tooltip
                    labelFormatter={(t) => fmtTime(Number(t))}
                    formatter={(val, name) => [`${val} мин`, meta(String(name)).label]}
                    contentStyle={{ background: '#12161d', border: '1px solid #1e2630', borderRadius: 6, fontSize: 12 }}
                    itemStyle={{ color: '#c9d1d9' }}
                    labelStyle={{ color: '#6b7686' }}
                  />
                  {statuses.map(s => (
                    <Line
                      key={s}
                      type="monotone"
                      dataKey={s}
                      name={s}
                      stroke={meta(s).color}
                      strokeWidth={active === s ? 3 : 1.8}
                      strokeOpacity={isDimmed(s) ? 0.12 : 1}
                      dot={false}
                      hide={solo != null && solo !== s}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </section>

          {/* распределение + таблица */}
          <section className="xs-card">
            <h3 className="xs-card-title">Распределение времени</h3>
            {pieData.length === 0 ? (
              <div className="xs-empty">Нет данных за период</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={pieData} dataKey="ms" cx="50%" cy="50%"
                       innerRadius={58} outerRadius={92} paddingAngle={3} strokeWidth={0}
                       isAnimationActive={false}>
                    {pieData.map((a) => (
                      <Cell key={a.status} fill={a.color} fillOpacity={isDimmed(a.status) ? 0.18 : 1} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val, _n, p) => {
                      const s = (p as { payload: Agg }).payload
                      return [`${s.pct}% · ${formatDuration(Number(val))}`, s.label]
                    }}
                    contentStyle={{ background: '#12161d', border: '1px solid #1e2630', borderRadius: 6, fontSize: 12 }}
                    itemStyle={{ color: '#c9d1d9' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </section>

          <section className="xs-card">
            <h3 className="xs-card-title">Агрегированные данные</h3>
            <table className="xs-table">
              <thead>
                <tr><th>Статус</th><th>Время</th><th>Доля</th><th>Переходов</th></tr>
              </thead>
              <tbody>
                {agg.map((a) => (
                  <tr
                    key={a.status}
                    className={`${solo === a.status ? 'is-solo' : ''} ${isDimmed(a.status) ? 'is-dim' : ''}`}
                    onMouseEnter={() => setHover(a.status)}
                    onMouseLeave={() => setHover(h => (h === a.status ? null : h))}
                    onClick={() => toggleSolo(a.status)}
                  >
                    <td><span className="xs-dot" style={{ background: a.color }} />{a.label}</td>
                    <td className="xs-mono">{formatDuration(a.ms)}</td>
                    <td className="xs-mono" style={{ color: a.color }}>{a.pct}%</td>
                    <td className="xs-mono">{a.transitions}</td>
                  </tr>
                ))}
                {agg.length === 0 && (
                  <tr><td colSpan={4} className="xs-empty">Нет данных за период</td></tr>
                )}
              </tbody>
              {agg.length > 0 && (
                <tfoot>
                  <tr>
                    <td>Итого</td>
                    <td className="xs-mono">{formatDuration(agg.reduce((s, a) => s + a.ms, 0))}</td>
                    <td className="xs-mono">100%</td>
                    <td className="xs-mono">{totalTransitions}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </section>
        </div>
      </div>
    </div>
  )
}


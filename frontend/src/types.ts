export interface Machine {
  machine_id: number
  status: string
  timestamp: string
  name: string
  type: string
  online: boolean
}

export interface LogEntry {
  machine_id: number
  status: string
  timestamp: string
}

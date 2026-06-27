package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "github.com/lib/pq"
)

type MachineStatus struct {
	MachineID int    `json:"machine_id"`
	Status    string `json:"status"`
	Timestamp string `json:"timestamp,omitempty"`
}

const offlineTimeout = 5 * time.Second

type MachineState struct {
	MachineID int       `json:"machine_id"`
	Status    string    `json:"status"`
	Timestamp string    `json:"timestamp"`
	Name      string    `json:"name"`
	Type      string    `json:"type"`
	Online    bool      `json:"online"`
	lastSeen         time.Time
	offlineRecorded  bool // уже записали offline-событие для этой паузы
}

var (
	db            *sql.DB
	mu            sync.Mutex
	machineStates = map[int]*MachineState{}
)

var machineNames = map[int]string{
	1: "Токарный",
	2: "Фрезерный",
	3: "Сверлильный",
	4: "Шлифовальный",
	5: "ЧПУ",
}

var machineTypes = map[int]string{
	1: "Токарная обработка",
	2: "Фрезерная обработка",
	3: "Сверление",
	4: "Шлифовка",
	5: "Программная обработка",
}

func machineName(id int) string {
	if n := machineNames[id]; n != "" {
		return n
	}
	return fmt.Sprintf("Станок №%d", id)
}

func initDB() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "host=localhost port=5433 user=cnc password=cnc_pass dbname=cnc_monitor sslmode=disable"
	}

	var err error
	db, err = sql.Open("postgres", dsn)
	if err != nil {
		log.Fatal("DB open:", err)
	}

	for i := range 10 {
		if err = db.Ping(); err == nil {
			break
		}
		log.Printf("DB недоступна, попытка %d/10...\n", i+1)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		log.Fatal("DB ping failed:", err)
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS machine_events (
			id         SERIAL PRIMARY KEY,
			machine_id INT         NOT NULL,
			status     VARCHAR(64) NOT NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_machine_events_machine_id
			ON machine_events(machine_id);
	`)
	if err != nil {
		log.Fatal("DB migrate:", err)
	}

	log.Println("PostgreSQL подключена")
}

// loadCurrentStates — при старте восстанавливаем текущий статус каждого станка из БД
func loadCurrentStates() {
	rows, err := db.Query(`
		SELECT DISTINCT ON (machine_id) machine_id, status, created_at
		FROM machine_events
		ORDER BY machine_id, created_at DESC
	`)
	if err != nil {
		log.Println("loadCurrentStates:", err)
		return
	}
	defer rows.Close()

	mu.Lock()
	defer mu.Unlock()
	for rows.Next() {
		var id int
		var status string
		var createdAt time.Time
		if err := rows.Scan(&id, &status, &createdAt); err != nil {
			continue
		}
		machineStates[id] = &MachineState{
			MachineID: id,
			Status:    status,
			Timestamp: createdAt.Local().Format("2006-01-02 15:04:05"),
			Name:      machineName(id),
			Type:      machineTypes[id],
		}
	}
	log.Printf("Восстановлено %d станков из БД\n", len(machineStates))
}

func postStatus(machineID int, status string) {
	now := time.Now()

	if _, err := db.Exec(
		`INSERT INTO machine_events (machine_id, status, created_at) VALUES ($1, $2, $3)`,
		machineID, status, now,
	); err != nil {
		log.Printf("DB insert error: %v\n", err)
	}

	mu.Lock()
	if prev := machineStates[machineID]; prev != nil && prev.offlineRecorded {
		// станок вернулся — сбрасываем флаг
		prev.offlineRecorded = false
	}
	machineStates[machineID] = &MachineState{
		MachineID: machineID,
		Status:    status,
		Timestamp: now.Format("2006-01-02 15:04:05"),
		Name:      machineName(machineID),
		Type:      machineTypes[machineID],
		Online:    true,
		lastSeen:  now,
	}
	mu.Unlock()

	log.Printf("[контроллер] machine_id=%d status=%s\n", machineID, status)
}

// POST /api/machine-status — от ESP8266
// GET  /api/machine-status?machine_id=X — лог по станку (или все записи без параметра)
func machineStatusHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")

	switch r.Method {
	case http.MethodPost:
		var data MachineStatus
		if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
			http.Error(w, "bad json: "+err.Error(), http.StatusBadRequest)
			return
		}
		postStatus(data.MachineID, data.Status)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"result": "ok"})

	case http.MethodGet:
		machineIDStr := r.URL.Query().Get("machine_id")
		period := r.URL.Query().Get("period")

		wheres := []string{}
		args := []interface{}{}
		idx := 1

		if machineIDStr != "" {
			mid, e := strconv.Atoi(machineIDStr)
			if e != nil {
				http.Error(w, "invalid machine_id", http.StatusBadRequest)
				return
			}
			wheres = append(wheres, fmt.Sprintf("machine_id = $%d", idx))
			args = append(args, mid)
			idx++
		}

		limit := 5000
		switch period {
		case "day":
			wheres = append(wheres, fmt.Sprintf("created_at >= $%d", idx))
			args = append(args, time.Now().Add(-24*time.Hour))
			idx++
			limit = 1000
		case "week":
			wheres = append(wheres, fmt.Sprintf("created_at >= $%d", idx))
			args = append(args, time.Now().Add(-7*24*time.Hour))
			idx++
			limit = 2000
		case "year":
			wheres = append(wheres, fmt.Sprintf("created_at >= $%d", idx))
			args = append(args, time.Now().Add(-365*24*time.Hour))
			idx++
			limit = 5000
		}

		q := "SELECT machine_id, status, created_at FROM machine_events"
		if len(wheres) > 0 {
			q += " WHERE " + strings.Join(wheres, " AND ")
		}
		q += fmt.Sprintf(" ORDER BY created_at DESC LIMIT $%d", idx)
		args = append(args, limit)

		rows, err := db.Query(q, args...)
		if err != nil {
			http.Error(w, "db error: "+err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		result := []MachineStatus{}
		for rows.Next() {
			var m MachineStatus
			var createdAt time.Time
			if err := rows.Scan(&m.MachineID, &m.Status, &createdAt); err != nil {
				continue
			}
			m.Timestamp = createdAt.Local().Format("2006-01-02 15:04:05")
			result = append(result, m)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

// GET /api/machines — текущий статус каждого станка; online=false если молчит > 15 сек
func machinesHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")

	now := time.Now()
	mu.Lock()
	states := make([]*MachineState, 0, len(machineStates))
	for _, s := range machineStates {
		cp := *s
		cp.Online = now.Sub(s.lastSeen) <= offlineTimeout
		if !cp.Online {
			cp.Status = "offline"
		}
		states = append(states, &cp)
	}
	mu.Unlock()

	sort.Slice(states, func(i, j int) bool { return states[i].MachineID < states[j].MachineID })
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(states)
}

// startOfflineWatcher — каждые 5 сек проверяет тишину и записывает offline в БД (один раз за паузу)
func startOfflineWatcher() {
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()
		for now := range ticker.C {
			mu.Lock()
			for _, state := range machineStates {
				if !state.offlineRecorded && now.Sub(state.lastSeen) > offlineTimeout {
					state.offlineRecorded = true
					offlineAt := state.lastSeen.Add(offlineTimeout)
					id := state.MachineID
					mu.Unlock()
					if _, err := db.Exec(
						`INSERT INTO machine_events (machine_id, status, created_at) VALUES ($1, $2, $3)`,
						id, "offline", offlineAt,
					); err != nil {
						log.Printf("DB offline insert: %v\n", err)
					} else {
						log.Printf("[контроллер] machine_id=%d status=offline\n", id)
					}
					mu.Lock()
				}
			}
			mu.Unlock()
		}
	}()
}

func main() {
	initDB()
	loadCurrentStates()
	startOfflineWatcher()

	staticDir := os.Getenv("STATIC_DIR")
	if staticDir == "" {
		staticDir = "../frontend/dist"
	}

	http.HandleFunc("/api/machine-status", machineStatusHandler)
	http.HandleFunc("/api/machines", machinesHandler)
	http.Handle("/", http.FileServer(http.Dir(staticDir)))

	addr := ":8080"
	log.Println("Сервер запущен на http://localhost" + addr)
	log.Fatal(http.ListenAndServe(addr, nil))
}

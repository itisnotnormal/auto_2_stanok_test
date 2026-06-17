package main

import (
	"encoding/json"
	"html/template"
	"log"
	"net/http"
	"sync"
	"time"
)

// MachineStatus — структура данных, которые присылает ESP8266
type MachineStatus struct {
	MachineID int    `json:"machine_id"`
	Status    string `json:"status"`
	Timestamp string `json:"timestamp,omitempty"` // заполняется сервером при получении
}

var (
	mu      sync.Mutex
	records []MachineStatus // храним все полученные записи в памяти
)

const maxRecords = 200 // чтобы память не росла бесконечно

func machineStatusHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		var data MachineStatus
		if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
			http.Error(w, "Некорректный JSON: "+err.Error(), http.StatusBadRequest)
			log.Println("Ошибка разбора JSON:", err)
			return
		}
		data.Timestamp = time.Now().Format("2006-01-02 15:04:05")

		mu.Lock()
		records = append(records, data)
		if len(records) > maxRecords {
			records = records[len(records)-maxRecords:]
		}
		mu.Unlock()

		log.Printf("Получены данные: machine_id=%d, status=%s\n", data.MachineID, data.Status)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"result": "ok"})

	case http.MethodGet:
		mu.Lock()
		defer mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(records)

	default:
		http.Error(w, "Метод не поддерживается", http.StatusMethodNotAllowed)
	}
}

// indexHandler — простая HTML-страница со списком последних статусов (с автообновлением)
func indexHandler(w http.ResponseWriter, r *http.Request) {
	mu.Lock()
	// последние записи сверху
	reversed := make([]MachineStatus, len(records))
	for i, rec := range records {
		reversed[len(records)-1-i] = rec
	}
	mu.Unlock()

	tmpl := template.Must(template.New("index").Parse(`
<!DOCTYPE html>
<html lang="ru">
<head>
	<meta charset="UTF-8">
	<title>Статусы станков</title>
	<meta http-equiv="refresh" content="3">
	<style>
		body { font-family: sans-serif; margin: 2rem; }
		table { border-collapse: collapse; width: 100%; max-width: 600px; }
		th, td { border: 1px solid #ccc; padding: 8px 12px; text-align: left; }
		th { background: #f0f0f0; }
		tr:nth-child(even) { background: #fafafa; }
	</style>
</head>
<body>
	<h1>Полученные статусы станков</h1>
	<p>Страница обновляется автоматически каждые 3 сек. Всего записей: {{len .}}</p>
	<table>
		<tr><th>Время</th><th>Machine ID</th><th>Статус</th></tr>
		{{range .}}
		<tr><td>{{.Timestamp}}</td><td>{{.MachineID}}</td><td>{{.Status}}</td></tr>
		{{end}}
	</table>
</body>
</html>
`))
	tmpl.Execute(w, reversed)
}

func main() {
	http.HandleFunc("/api/machine-status", machineStatusHandler)
	http.HandleFunc("/", indexHandler)

	addr := ":8080"
	log.Println("Сервер запущен на http://localhost" + addr)
	log.Println("ESP8266 должен отправлять POST на http://<IP_этого_компа>:8080/api/machine-status")
	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatal(err)
	}
}

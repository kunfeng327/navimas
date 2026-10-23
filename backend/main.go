package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	openai "github.com/sashabaranov/go-openai"
)

func ptrJSONObject() *openai.ChatCompletionResponseFormat {
	return &openai.ChatCompletionResponseFormat{Type: openai.ChatCompletionResponseFormatTypeJSONObject}
}

// ---------- 请求模型 ----------

type userReq struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type chatMessageReq struct {
	SessionID string `json:"session_id"`
	Role      string `json:"role"`
	Content   string `json:"content"`
}

type profileItemReq struct {
	ID          int     `json:"id"`
	Date        string  `json:"date"`
	Destination string  `json:"destination"`
	Attractions string  `json:"attractions"`
	Cost        float64 `json:"cost"`
}

type profileIDReq struct {
	ID int `json:"id"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, detail string) {
	writeJSON(w, status, map[string]string{"detail": detail})
}

// ---------- 认证接口 ----------

func handleRegister(w http.ResponseWriter, r *http.Request) {
	var u userReq
	if err := json.NewDecoder(r.Body).Decode(&u); err != nil {
		writeError(w, http.StatusBadRequest, "请求格式错误")
		return
	}
	_, err := userDB.Exec("INSERT INTO users (username, password) VALUES (?, ?)", u.Username, u.Password)
	if err != nil {
		writeError(w, http.StatusBadRequest, "用户名已存在")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "注册成功"})
}

func handleLogin(w http.ResponseWriter, r *http.Request) {
	var u userReq
	if err := json.NewDecoder(r.Body).Decode(&u); err != nil {
		writeError(w, http.StatusBadRequest, "请求格式错误")
		return
	}
	var id int
	err := userDB.QueryRow("SELECT id FROM users WHERE username=? AND password=?", u.Username, u.Password).Scan(&id)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "用户名或密码错误")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"message": "登录成功", "token": "navimas_token"})
}

// ---------- 聊天记录接口 ----------

func handleSaveHistory(w http.ResponseWriter, r *http.Request) {
	var msg chatMessageReq
	if err := json.NewDecoder(r.Body).Decode(&msg); err != nil {
		writeError(w, http.StatusBadRequest, "请求格式错误")
		return
	}
	_, err := histDB.Exec("INSERT INTO chat_logs (session_id, role, content) VALUES (?, ?, ?)",
		msg.SessionID, msg.Role, msg.Content)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "数据库操作失败")
		return
	}

	// AI 回复且包含"总预算"时，调用 Qwen 抽取结构化档案
	if msg.Role == "ai" && strings.Contains(msg.Content, "总预算") {
		extractProfileFromContent(msg.Content)
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "success", "message": "记录及档案已保存"})
}

// extractProfileFromContent 用 Qwen 从规划文本提取结构化数据存入档案。
func extractProfileFromContent(content string) {
	_, qwen, err := llmClients()
	if err != nil {
		log.Println("提取档案失败（缺少密钥）:", err)
		return
	}
	prompt := fmt.Sprintf(`
            你是一个信息提取助手。请从下面这段旅游规划文本中提取关键信息，并严格以 JSON 格式返回。
            必须且只能包含以下 4 个字段：
            - "date": 出行日期 (字符串，如 "2026-04-28")
            - "destination": 目的地城市 (字符串，如 "北京")
            - "attractions": 包含的核心景点 (字符串，用逗号分隔)
            - "cost": 总计花费预估 (数字类型，不要带货币符号)
            旅游规划文本：
%q`, content)

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	resp, err := qwen.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
		Model: "qwen-plus",
		Messages: []openai.ChatCompletionMessage{
			{Role: openai.ChatMessageRoleSystem, Content: "你是一个只输出 JSON 的机器。"},
			{Role: openai.ChatMessageRoleUser, Content: prompt},
		},
		ResponseFormat: ptrJSONObject(),
	})
	if err != nil || len(resp.Choices) == 0 {
		log.Println("调用 Qwen 提取数据时发生错误:", err)
		return
	}
	var extracted struct {
		Date        string  `json:"date"`
		Destination string  `json:"destination"`
		Attractions string  `json:"attractions"`
		Cost        float64 `json:"cost"`
	}
	if err := json.Unmarshal([]byte(strings.TrimSpace(resp.Choices[0].Message.Content)), &extracted); err != nil {
		log.Println("Qwen 返回的格式不是合法的 JSON:", err)
		return
	}
	if extracted.Date == "" {
		extracted.Date = "未知日期"
	}
	if extracted.Destination == "" {
		extracted.Destination = "未知地"
	}
	if extracted.Attractions == "" {
		extracted.Attractions = "多个景点"
	}
	_, err = histDB.Exec("INSERT INTO travel_profiles (date, destination, attractions, cost) VALUES (?, ?, ?, ?)",
		extracted.Date, extracted.Destination, extracted.Attractions, extracted.Cost)
	if err == nil {
		log.Printf("Qwen 提取档案成功: %s, 花费 %f 元", extracted.Destination, extracted.Cost)
	}
}

type profileRow struct {
	ID          int     `json:"id"`
	Date        string  `json:"date"`
	Destination string  `json:"destination"`
	Attractions string  `json:"attractions"`
	Cost        float64 `json:"cost"`
	CreatedAt   string  `json:"created_at"`
}

func handleGetProfile(w http.ResponseWriter, r *http.Request) {
	rows, err := histDB.Query("SELECT id, date, destination, attractions, cost, COALESCE(created_at,'') FROM travel_profiles ORDER BY date DESC")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "数据库操作失败")
		return
	}
	defer rows.Close()

	var data []profileRow
	destCount := map[string]int{}
	totalCost := 0.0
	for rows.Next() {
		var p profileRow
		if err := rows.Scan(&p.ID, &p.Date, &p.Destination, &p.Attractions, &p.Cost, &p.CreatedAt); err != nil {
			continue
		}
		data = append(data, p)
		destCount[p.Destination]++
		totalCost += p.Cost
	}

	if len(data) == 0 {
		writeJSON(w, http.StatusOK, map[string]any{
			"status": "empty",
			"message": "数据库中尚无结构化档案，请先生成一份旅游规划或点击同步。",
			"pie_data":   []any{},
			"table_data": []any{},
		})
		return
	}

	favorite := "暂无"
	maxN := 0
	for k, v := range destCount {
		if v > maxN {
			maxN = v
			favorite = k
		}
	}

	pie := make([]map[string]any, 0, len(destCount))
	for k, v := range destCount {
		pie = append(pie, map[string]any{"name": k, "value": v})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status": "success",
		"stats": map[string]any{
			"total_trips":   len(data),
			"total_cost":    totalCost,
			"favorite_city": favorite,
		},
		"pie_data":   pie,
		"table_data": data,
	})
}

func handleUpdateProfile(w http.ResponseWriter, r *http.Request) {
	var item profileItemReq
	if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
		writeError(w, http.StatusBadRequest, "请求格式错误")
		return
	}
	res, err := histDB.Exec("UPDATE travel_profiles SET date=?, destination=?, attractions=?, cost=? WHERE id=?",
		item.Date, item.Destination, item.Attractions, item.Cost, item.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "数据库操作失败")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeError(w, http.StatusNotFound, "未找到该条记录")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "success", "message": "数据更新成功"})
}

func handleAddProfile(w http.ResponseWriter, r *http.Request) {
	today := time.Now().Format("2006/01/02")
	_, err := histDB.Exec("INSERT INTO travel_profiles (date, destination, attractions, cost) VALUES (?, ?, ?, ?)",
		today, "新目的地", "点击输入景点...", 0.0)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "数据库操作失败")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "success", "message": "新增空记录成功"})
}

func handleDeleteProfile(w http.ResponseWriter, r *http.Request) {
	var item profileIDReq
	if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
		writeError(w, http.StatusBadRequest, "请求格式错误")
		return
	}
	res, err := histDB.Exec("DELETE FROM travel_profiles WHERE id=?", item.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "数据库操作失败")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeError(w, http.StatusNotFound, "未找到记录")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "success", "message": "删除成功"})
}

// ---------- 历史会话 ----------

func handleGetHistory(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("session_id")
	rows, err := histDB.Query(
		"SELECT role, content, COALESCE(timestamp,'') FROM chat_logs WHERE session_id = ? ORDER BY id ASC", sessionID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "数据库操作失败")
		return
	}
	defer rows.Close()

	type entry struct {
		Role    string `json:"role"`
		Content string `json:"content"`
		Time    string `json:"time"`
	}
	var out []entry
	for rows.Next() {
		var e entry
		if rows.Scan(&e.Role, &e.Content, &e.Time) == nil {
			out = append(out, e)
		}
	}
	if out == nil {
		out = []entry{}
	}
	writeJSON(w, http.StatusOK, out)
}

// ---------- CORS 中间件 ----------

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ---------- 入口 ----------

func main() {
	loadEnvFile()
	initDatabases()

	mux := http.NewServeMux()

	mux.HandleFunc("POST /api/register", handleRegister)
	mux.HandleFunc("POST /api/login", handleLogin)
	mux.HandleFunc("POST /api/history/save", handleSaveHistory)
	mux.HandleFunc("GET /api/history/{session_id}", handleGetHistory)
	mux.HandleFunc("GET /api/profile", handleGetProfile)
	mux.HandleFunc("POST /api/profile/update", handleUpdateProfile)
	mux.HandleFunc("POST /api/profile/add", handleAddProfile)
	mux.HandleFunc("POST /api/profile/delete", handleDeleteProfile)
	mux.HandleFunc("POST /api/chat", handleChat)

	// 静态资源：优先提供 frontend/dist（React 构建产物）
	staticDir := filepath.Join("frontend", "dist")
	if _, err := os.Stat(staticDir); err == nil {
		sub, _ := fs.Sub(os.DirFS(staticDir), ".")
		mux.Handle("GET /app/", http.StripPrefix("/app", http.FileServer(http.FS(sub))))
		mux.Handle("GET /", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/" {
				http.Redirect(w, r, "/app/", http.StatusFound)
				return
			}
			http.FileServer(http.FS(sub)).ServeHTTP(w, r)
		}))
	} else {
		mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
			writeJSON(w, http.StatusOK, map[string]string{
				"message": "NaviMAS Go 后端运行中。未检测到 frontend/dist，请先构建前端或使用 vite dev server。",
			})
		})
	}

	host := os.Getenv("HOST")
	if host == "" {
		host = "0.0.0.0"
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8000"
	}
	addr := host + ":" + port
	fmt.Printf("NaviMAS Go 后端启动: http://%s\n", addr)
	log.Fatal(http.ListenAndServe(addr, withCORS(mux)))
}

package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

var (
	histDB *sql.DB
	userDB *sql.DB
)

func dbPaths() (histFile, userFile string) {
	base := os.Getenv("NAVIMAS_DATA_DIR")
	if base == "" {
		exe, err := os.Executable()
		if err == nil {
			base = filepath.Dir(exe)
		} else {
			base = "."
		}
		// 开发模式：优先使用仓库根目录（backend 的上一级）
		if _, err := os.Stat(filepath.Join(base, "backend")); err == nil {
			base = filepath.Join(base, "backend")
		}
	}
	return filepath.Join(base, "history.db"), filepath.Join(base, "navimas.db")
}

func initDatabases() {
	histFile, userFile := dbPaths()

	var err error
	histDB, err = sql.Open("sqlite", histFile+"?_pragma=busy_timeout(5000)")
	if err != nil {
		log.Fatalf("打开历史数据库失败: %v", err)
	}
	userDB, err = sql.Open("sqlite", userFile+"?_pragma=busy_timeout(5000)")
	if err != nil {
		log.Fatalf("打开用户数据库失败: %v", err)
	}

	if _, err := userDB.Exec(`
		CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			username TEXT UNIQUE NOT NULL,
			password TEXT NOT NULL
		)`); err != nil {
		log.Fatalf("初始化用户表失败: %v", err)
	}

	if _, err := histDB.Exec(`
		CREATE TABLE IF NOT EXISTS chat_logs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			session_id TEXT,
			role TEXT,
			content TEXT,
			timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
		);
		CREATE TABLE IF NOT EXISTS travel_profiles (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			date TEXT,
			destination TEXT,
			attractions TEXT,
			cost REAL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`); err != nil {
		log.Fatalf("初始化历史表失败: %v", err)
	}

	fmt.Println("所有数据库初始化完成!")
}

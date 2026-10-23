# NaviMAS 智游图谱 · 旅游多智能体系统

多智能体协同行程规划系统（React + Go 重构版）。

## 架构

- **前端**：React 18 + TypeScript + Vite + Tailwind CSS v4 + React Router（Hash 模式）
  - 页面：登录 / 注册 / 规划台（聊天+TDAG 日志+沙盘）/ 对话档案 / 随行日记 / 灵感库 / 旅行档案 / 高德地图沙盘
- **后端**：Go（标准库 `net/http`，方法路由）+ modernc.org/sqlite（纯 Go，无需 CGO）
  - 多智能体 TDAG 引擎：Planner（DeepSeek）→ Executor（Qwen）→ Validator（DeepSeek）→ Extractor（结构化）→ VisionAgent（qwen-vl-plus 图片识别）
  - SSE 流式推送：`log` / `answer_piece` / `timeline_data` / `error` 四类事件
  - 数据库：用户表（navimas.db）、聊天记录与行程档案（history.db）

## 快速开始

### 1. 配置密钥（环境变量）

```bash
# Windows (Git Bash)
export DEEPSEEK_KEY=sk-xxx
export QWEN_KEY=sk-xxx

# Windows (PowerShell)
$env:DEEPSEEK_KEY="sk-xxx"; $env:QWEN_KEY="sk-xxx"
```

前端可选环境变量（`frontend/.env.local`）：

```
VITE_API_BASE=
VITE_AMAP_KEY=你的高德key
VITE_AMAP_SECURITY_CODE=你的高德安全码
```

### 2. 启动后端（端口 8000）

```bash
cd backend
go mod tidy
go run .
```

### 3. 启动前端开发服务器（端口 5174，自动代理 /api 到 8000）

```bash
cd frontend
npm install
npm run dev
```

访问 http://127.0.0.1:5174

### 4. 生产部署

```bash
cd frontend && npm run build   # 产物在 frontend/dist
cd backend && go build -o navimas .
DEEPSEEK_KEY=... QWEN_KEY=... ./navimas   # 自动托管 dist，访问 http://127.0.0.1:8000/app/
```

## API 一览

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /api/register | 注册 |
| POST | /api/login | 登录 |
| POST | /api/chat | 多智能体规划（SSE 流式） |
| POST | /api/history/save | 保存对话（AI 回复含预算时自动抽取档案） |
| GET | /api/history/{session_id} | 查询会话记录 |
| GET | /api/profile | 档案统计（含饼图数据） |
| POST | /api/profile/update / add / delete | 档案增删改 |

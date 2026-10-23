# 启动

## 后端（先启动，端口 8000）

首次使用：把 `backend/.env.example` 复制为 `backend/.env`，填入你的 Key（如 `ZHIPU_KEY=xxx`）。

```powershell
cd backend; .\backend.exe
```

## 前端（端口 5174，自动代理 /api 到 8000）

```powershell
cd frontend; npm run dev
```

打开 http://localhost:5174

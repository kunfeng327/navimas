import asyncio
import json
import re
import sqlite3
import os
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from openai import OpenAI
import key
from datetime import datetime


BASE_DIR = Path(__file__).resolve().parent
DB_FILE = str(BASE_DIR / "history.db")
USER_DB_FILE = str(BASE_DIR / "navimas.db")
DEEPSEEK_KEY = key.DEEPSEEK_KEY
QWEN_KEY = key.QWEN_KEY
app = FastAPI()

deepseek_client = OpenAI(api_key=DEEPSEEK_KEY, base_url="https://api.deepseek.com")
qwen_client = OpenAI(api_key=QWEN_KEY, base_url="https://dashscope.aliyuncs.com/compatible-mode/v1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/app", StaticFiles(directory=str(BASE_DIR / "frontend")), name="frontend")


# 数据库初始化
def init_databases():
    conn_user = sqlite3.connect(USER_DB_FILE)
    cursor_user = conn_user.cursor()
    cursor_user.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )
    ''')
    conn_user.commit()
    conn_user.close()

    conn_hist = sqlite3.connect(DB_FILE)
    cursor_hist = conn_hist.cursor()

    cursor_hist.execute('''
        CREATE TABLE IF NOT EXISTS chat_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT,      
            role TEXT,            
            content TEXT,         
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    cursor_hist.execute('''
        CREATE TABLE IF NOT EXISTS travel_profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT,            -- 规划日期
            destination TEXT,     -- 目的地
            attractions TEXT,     -- 提取出的景点
            cost REAL,            -- 预估花费
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    conn_hist.commit()
    conn_hist.close()
    print("所有数据库初始化完成!")


init_databases()


# 数据模型定义
class User(BaseModel):
    username: str
    password: str


class ChatMessage(BaseModel):
    session_id: str
    role: str
    content: str


class ProfileDeleteItem(BaseModel):
    id: int


class ProfileUpdateItem(BaseModel):
    id: int
    date: str
    destination: str
    attractions: str
    cost: float


class ChatRequest(BaseModel):
    prompt: str
    region: str
    image: Optional[str] = None  # 接收图片数据


# 智能体架构
class AgentProfile:
    def __init__(self, role, goal, constraints):
        self.role, self.goal, self.constraints = role, goal, constraints

    def get_system_prompt(self):
        return f"你是{self.role}。你的目标是{self.goal}。遵守约束：{self.constraints}"


class AgentMemory:
    def __init__(self, window_size=5):
        self.history = []
        self.window_size = window_size

    def add_record(self, role, content):
        self.history.append({"role": role, "content": content})

    def get_context(self):
        return self.history[-(self.window_size * 2):] if self.window_size > 0 else []


deepseek_client = OpenAI(api_key=DEEPSEEK_KEY, base_url="https://api.deepseek.com")
qwen_client = OpenAI(api_key=QWEN_KEY, base_url="https://dashscope.aliyuncs.com/compatible-mode/v1")

class SmartAgent:
    def __init__(self, profile, client, model_name, region="", core_prompt=""):
        self.profile = profile
        self.model_name = model_name
        self.client = client
        self.memory = AgentMemory(window_size=3)
        self.region = region
        self.core_prompt = core_prompt

    def action(self, user_prompt, is_json=False):
        # 动态生成增强后的System Prompt
        base_system = self.profile.get_system_prompt()
        enhanced_system = f"{base_system}\n【行程背景】目的地：{self.region}；用户核心诉求：{self.core_prompt}"

        messages = [{"role": "system", "content": enhanced_system}]
        messages += self.memory.get_context()
        messages.append({"role": "user", "content": user_prompt})

        # 调用同步API
        response = self.client.chat.completions.create(
            model=self.model_name,
            messages=messages,
            response_format={'type': 'json_object'} if is_json else None,
            temperature=0.7
        )
        res_text = response.choices[0].message.content

        # 清洗可能出现的Markdown代码块标识
        if is_json:
            res_text = re.sub(r'```json\n?|\n?```', '', res_text).strip()

        self.memory.add_record("assistant", res_text)
        return res_text


# 视觉智能体（多模态解析）
class VisionAgent:
    def __init__(self, client, model_name="qwen-vl-plus"):
        self.client = client
        self.model_name = model_name

    async def analyze_image(self, base64_image: str):
        if not base64_image.startswith("data:image"):
            if "," in base64_image:
                base64_image = base64_image.split(",")[1]
            base64_image = f"data:image/jpeg;base64,{base64_image}"

        response = await asyncio.to_thread(
            self.client.chat.completions.create,
            model=self.model_name,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "识别图片中的旅游景点或城市，并给出具体的地点名称。如果无法确定精确地点，请描述其地理特征（如：海滨、古镇、雪山）。输出格式：地点：[地点名称]；特征：[特征描述]"},
                        {"type": "image_url", "image_url": {"url": base64_image}}
                    ],
                }
            ],
            max_tokens=300,
        )
        return response.choices[0].message.content


class ChatRequest(BaseModel):
    prompt: str
    region: str
    image: Optional[str] = None  # 接收图片数据


# 认证相关接口
@app.get("/")
def read_root():
    return RedirectResponse(url="/app/login.html")


@app.post("/api/register")
def register(user: User):
    try:
        conn = sqlite3.connect(USER_DB_FILE)
        cursor = conn.cursor()
        cursor.execute("INSERT INTO users (username, password) VALUES (?, ?)", (user.username, user.password))
        conn.commit()
        return {"message": "注册成功"}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="用户名已存在")
    finally:
        conn.close()

@app.post("/api/login")
def login(user: User):
    conn = sqlite3.connect(USER_DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username=? AND password=?", (user.username, user.password))
    result = cursor.fetchone()
    conn.close()

    if result:
        return {"message": "登录成功", "token": "navimas_token"}
    raise HTTPException(status_code=401, detail="用户名或密码错误")


# 聊天记录与档案接口
@app.post("/api/history/save")
async def save_history(msg: ChatMessage):
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    # 1. 存入原始对话
    cursor.execute(
        "INSERT INTO chat_logs (session_id, role, content) VALUES (?, ?, ?)",
        (msg.session_id, msg.role, msg.content)
    )

    # 2. 如果是 AI 回复的规划内容，调用 Qwen Agent 进行 JSON 结构化提取
    if msg.role == 'ai' and "总预算" in msg.content:
        try:
            print("正在呼叫 Qwen 提取结构化数据...")
            prompt = f"""
            你是一个信息提取助手。请从下面这段旅游规划文本中提取关键信息，并严格以 JSON 格式返回。
            必须且只能包含以下 4 个字段：
            - "date": 出行日期 (字符串，如 "2026-04-28")
            - "destination": 目的地城市 (字符串，如 "北京")
            - "attractions": 包含的核心景点 (字符串，用逗号分隔)
            - "cost": 总计花费预估 (数字类型，不要带货币符号)
            旅游规划文本：\n{msg.content}
            """

            response = qwen_client.chat.completions.create(
                model="qwen-plus",
                messages=[
                    {"role": "system", "content": "你是一个只输出 JSON 的机器。"},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"}
            )

            json_str = response.choices[0].message.content
            extracted_data = json.loads(json_str)

            ext_date = extracted_data.get("date", "未知日期")
            ext_dest = extracted_data.get("destination", "未知地")
            ext_attr = extracted_data.get("attractions", "多个景点")
            ext_cost = float(extracted_data.get("cost", 0.0))

            cursor.execute(
                "INSERT INTO travel_profiles (date, destination, attractions, cost) VALUES (?, ?, ?, ?)",
                (ext_date, ext_dest, ext_attr, ext_cost)
            )
            print(f"Qwen 提取档案成功: {ext_dest}, 花费 {ext_cost} 元")

        except json.JSONDecodeError:
            print("Qwen 返回的格式不是合法的 JSON")
        except Exception as e:
            print(f"调用 Qwen 提取数据时发生错误: {e}")

    conn.commit()
    conn.close()
    return {"status": "success", "message": "记录及档案已保存"}


@app.get("/api/profile/sync")
def sync_old_data():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    cursor.execute("DELETE FROM travel_profiles")
    print("已清空默认测试数据。")

    cursor.execute("SELECT content FROM chat_logs WHERE role = 'ai' AND content LIKE '%预算%'")
    logs = cursor.fetchall()

    success_count = 0
    for log in logs:
        content = log[0]
        try:
            date_match = re.search(r'【(\d{4}-\d{2}-\d{2})】', content)
            date = date_match.group(1) if date_match else "未知日期"

            cost_match = re.search(r'总计.*?(\d+)元', content)
            cost = float(cost_match.group(1)) if cost_match else 0.0

            dest_match = re.search(r'查询.*?期间([\u4e00-\u9fa5]{2,4})酒店', content)
            dest = dest_match.group(1) if dest_match else "北京"

            attractions_list = re.findall(r'\d+\.\s+([\u4e00-\u9fa5]+)\（', content)
            if not attractions_list:
                attractions_list = re.findall(r'\*\*(.*?)\*\*', content)
                attractions_list = [a for a in attractions_list if '酒店' not in a and '费用' not in a]

            attractions = ", ".join(list(set(attractions_list))[:4])
            if not attractions:
                attractions = "多个景点"

            cursor.execute(
                "INSERT INTO travel_profiles (date, destination, attractions, cost) VALUES (?, ?, ?, ?)",
                (date, dest, attractions, cost)
            )
            success_count += 1

        except Exception as e:
            print(f"转换某条记录时出错忽略: {e}")

    conn.commit()
    conn.close()

    return {
        "status": "success",
        "message": f"数据同步完成！共从旧聊天记录中提取了 {success_count} 条真实档案。"
    }


@app.get("/api/history/{session_id}")
async def get_history(session_id: str):
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute(
        "SELECT role, content, timestamp FROM chat_logs WHERE session_id = ? ORDER BY id ASC",
        (session_id,)
    )
    rows = cursor.fetchall()
    conn.close()
    return [{"role": row["role"], "content": row["content"], "time": row["timestamp"]} for row in rows]


@app.get("/api/profile")
def get_user_profile():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM travel_profiles ORDER BY date DESC")
    rows = cursor.fetchall()

    if not rows:
        conn.close()
        return {
            "status": "empty",
            "message": "数据库中尚无结构化档案，请先生成一份旅游规划或点击同步。",
            "pie_data": [],
            "table_data": []
        }
    conn.close()

    history_data = []
    dest_count = {}
    total_cost = 0

    for row in rows:
        item = dict(row)
        history_data.append(item)
        dest = item["destination"]
        dest_count[dest] = dest_count.get(dest, 0) + 1
        total_cost += item["cost"]

    pie_chart_data = [{"name": k, "value": v} for k, v in dest_count.items()]

    return {
        "status": "success",
        "stats": {
            "total_trips": len(history_data),
            "total_cost": total_cost,
            "favorite_city": max(dest_count, key=dest_count.get) if dest_count else "暂无"
        },
        "pie_data": pie_chart_data,
        "table_data": history_data
    }


@app.post("/api/profile/update")
def update_user_profile(item: ProfileUpdateItem):
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE travel_profiles SET date=?, destination=?, attractions=?, cost=? WHERE id=?",
            (item.date, item.destination, item.attractions, item.cost, item.id)
        )
        conn.commit()

        if cursor.rowcount == 0:
            conn.close()
            raise HTTPException(status_code=404, detail="未找到该条记录")

        conn.close()
        return {"status": "success", "message": "数据更新成功"}
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail="数据库操作失败")


# 核心路由与TDAG引擎
@app.post("/api/chat")
async def chat(request: ChatRequest):
    common_args = {"region": request.region, "core_prompt": request.prompt}
    text_bigwords = '【核心实体加粗】：包括但不限于景点名、酒店名、餐厅名'
    # a.架构师：严格输出图结构
    planner = SmartAgent(
        AgentProfile(
            "行程分解师",
            "将复杂的旅行需求拆解为TDAG（有向无环图）结构。",
            """输出严格的JSON格式：
            {
              "nodes": [
                {"id": "T1", "task": "明确出游日期和总预算", "depends_on": []},
                {"id": "T2", "task": "查询特色酒店", "depends_on": ["T1"]},
                {"id": "T3", "task": "查询核心景点门票与交通", "depends_on": ["T1"]},
                {"id": "T4", "task": "规划每日游玩路线并校验", "depends_on": ["T2", "T3"]}
              ]
            }
            注意：没有依赖的任务 depends_on 为空列表；相互独立的任务必须并行。"""
        ),
        deepseek_client, "deepseek-chat", **common_args
    )

    # b.执行者与校验者
    executor = SmartAgent(
        AgentProfile(
            f"{request.region}资源专家",
            "根据目的地信息提供具体的酒店、交通和景点细节",
            "必须包含实时估算的交通时长和门票参考。重要约束：由于你是多智能体流水线上的一个中间节点。严禁在结尾输出任何总结语、客套话、或者反问句（例如'是否需要我为您生成...'、'如果需要调整请告诉我...'、'九、总结'等）"
            + text_bigwords
        ),
        qwen_client, "qwen-turbo", **common_args
    )

    validator = SmartAgent(
        AgentProfile("方案校验员", "负责检查行程的可行性（如时间冲突、路线是否绕路、预算超支）", "输出JSON: {'score': 0-100, 'suggestion': '...'}"),
        deepseek_client, "deepseek-chat", **common_args
    )

    # c. 数据清洗专家（把非结构化文本变成JSON，解决正则解析不稳定的痛点）
    extractor = SmartAgent(
        AgentProfile(
            "数据结构化大师",
            "你的唯一任务是从提供的一篇游玩攻略中，提取出每日的行程安排，并结合你的真实世界地理常识，为每个核心地点补充高德地图的经纬度坐标，转化为严格的 JSON 格式。",
            """必须输出如下格式的 JSON（不要带其他废话）：
            {
              "days": [
                {
                  "dayLabel": "第一天",
                  "date": "4月25日",
                  "title": "抵达杭州与西湖周边",
                  "details": [
                    {"time": "上午", "desc": "抵达杭州，入住君悦酒店"},
                    {"time": "下午", "desc": "步行游览西湖"}
                  ],
                  "nodes": [
                    {"name": "君悦酒店", "lnglat": [120.161048, 30.258814]},
                    {"name": "西湖", "lnglat": [120.151126, 30.26477]}
                  ]
                }
              ]
            }
            注意：
            1. 【关键】必须提取行程中的具体地点，并在 nodes 数组中输出。利用你的世界知识，给出尽可能准确的 [经度, 纬度] 数组。
            2. 只输出纯 JSON 字符串，不含任何 Markdown 标记。"""
        ),
        deepseek_client, "deepseek-chat", **common_args
    )

    # d. Vision Agent
    vision_agent = VisionAgent(
        qwen_client,
        "qwen-vl-plus"
    )

    async def event_generator():
        # 创建一个异步队列，作为多Agent协同通信的桥梁
        queue = asyncio.Queue()

        # 定义后台独立运行的TDAG引擎
        async def execute_tdag():
            # 图片前置处理
            enhanced_prompt = request.prompt
            if request.image:
                await queue.put(
                    f"data: {json.dumps({'type': 'log', 'content': '👁️ **[Vision Agent]** 正在通过照片定位您的灵感景点...'})}\n\n")
                try:
                    # 识别图片内容
                    vision_result = await vision_agent.analyze_image(request.image)
                    enhanced_prompt = f"【图片灵感：{vision_result}】。用户上传了一张照片，请务必在行程中包含或参考此地点：{vision_result}。其他要求：{request.prompt}"
                    await queue.put(
                        f"data: {json.dumps({'type': 'log', 'content': f'✨ **[识别成功]** 发现灵感：{vision_result}'})}\n\n")
                except Exception as e:
                    await queue.put(f"data: {json.dumps({'type': 'log', 'content': '⚠️ 视觉识别失败，将按纯文本需求继续规划。'})}\n\n")

            # 将增强后的prompt传给common_args以便所有Agent共享背景
            # 注：此处需动态更新planner和executor的context
            planner.core_prompt = enhanced_prompt
            executor.core_prompt = enhanced_prompt

            max_global_retries = 5  # 最大重试次数
            suggestion = ""
            final_itinerary_content = ""

            try:
                for plan_attempt in range(max_global_retries):
                    # ----------------- 第1步：日志打印 -----------------
                    if plan_attempt > 0:
                        await queue.put(
                            f"data: {json.dumps({'type': 'log', 'content': f'🔄 **[全局重置]** 正在进行第 {plan_attempt + 1} 次全局重新规划...'})}\n\n"
                        )
                    else:
                        log_msg = f"🧭 **[TDAG 构建]** 正在为【{request.region}】构建任务图..."
                        if request.image:
                            log_msg = f"🧭 **[灵感融合]** 已将照片景点注入 TDAG，正在生成最优路径..."

                        await queue.put(f"data: {json.dumps({'type': 'log', 'content': log_msg})}\n\n")

                    # ----------------- 第2步：生成新计划 -----------------
                    prompt_for_planner = f"主诉求：{enhanced_prompt}。请拆解任务。"
                    if plan_attempt > 0 and suggestion:
                        prompt_for_planner += f" 注意，上一次规划在节点执行时失败了，原因是：{suggestion}。请在此次规划中规避此问题。"

                    raw_plan = await asyncio.to_thread(planner.action, prompt_for_planner, True)
                    plan_data = json.loads(raw_plan)
                    nodes = plan_data.get("nodes", [])

                    completed_tasks = set()
                    layer_count = 1
                    need_replan = False  # 全局重置的触发信号

                    current_plan_pieces = {}    # 记录最终的输出方案

                    # ----------------- 第3步：TDAG调度引擎 -----------------
                    while len(completed_tasks) < len(nodes):
                        current_layer_nodes = [
                            n for n in nodes
                            if n['id'] not in completed_tasks and all(
                                dep in completed_tasks for dep in n.get('depends_on', []))
                        ]

                        if not current_layer_nodes:
                            await queue.put(
                                f"data: {json.dumps({'type': 'log', 'content': '⚠️ **[调度异常]** 检测到图结构存在死锁，尝试重新规划！'})}\n\n"
                            )
                            need_replan = True
                            break

                        # 节点处理函数
                        async def process_node(node):
                            t_id = node['id']
                            t_desc = node['task']

                            await queue.put(
                                f"data: {json.dumps({'type': 'log', 'content': f'🛠️ **[执行]** [{t_id}] {t_desc}'})}\n\n"
                            )
                            content = await asyncio.to_thread(executor.action, f"针对 {request.region} 规划环节：{t_desc}。")

                            await queue.put(
                                f"data: {json.dumps({'type': 'log', 'content': f'🔍 **[校验]** [{t_id}] 正在校验合理性...'})}\n\n"
                            )
                            # 通过prompt提高校验灵活度
                            validation_prompt = f"""
                            请严格评审以下行程规划：{content}

                            【评审宽容度规则】
                            1. 预算弹性：允许总预算有 10% ~ 15% 的合理上浮。例如目标预算 5000，只要在 5750 以内，且行程体验极佳，在预算项上依然可以给满分。
                            2. 时间弹性：如果单日行程稍微紧凑，只要物理上可行（如打车能赶到），请不要判定为死锁错误，可以扣少量分数并给出提示即可。
                            3. 核心原则：除非出现严重的逻辑矛盾（如同一时间出现在两地、预算超标 50% 以上、强依赖未完成），否则请尽量给出 80 分以上的通过成绩。

                            给出评分（score）和建议（suggestion）。
                            """
                            val_res_raw = await asyncio.to_thread(validator.action, validation_prompt, True)
                            val_res = json.loads(val_res_raw)

                            score = val_res.get('score', 0)
                            inner_suggestion = val_res.get('suggestion', '无')

                            if score >= 80:
                                section_md = f'<div class="task-header-card">📌 任务 {t_id}：{t_desc}</div>\n\n{content}\n\n---\n\n'
                                current_plan_pieces[t_id] = section_md

                                # 判断当前节点是否是“路线规划”节点，以便后续提取行程正文
                                if "行程规划" in t_desc or "行程" in t_desc:
                                    final_itinerary_content = content

                                return t_id, True, None
                            else:
                                return t_id, False, inner_suggestion

                        # 并发执行当前层
                        results = await asyncio.gather(*(process_node(n) for n in current_layer_nodes))

                        # 严格的层级结算与打断机制
                        for t_id, success, fail_suggestion in results:
                            if success:
                                completed_tasks.add(t_id)
                            else:
                                await queue.put(
                                    f"data: {json.dumps({'type': 'log', 'content': f'⚠️ **[第 {plan_attempt + 1} 次校验失败]   ** 原因：{fail_suggestion}'})}\n\n")
                                suggestion = fail_suggestion  # 将失败建议存下来，供下一次Planner使用
                                need_replan = True
                                break  # 跳出results的for循环

                        if need_replan:
                            break  # 跳出TDAG的while循环，放弃后续节点的执行

                        layer_count += 1
                        await asyncio.sleep(0.1)

                    # ----------------- 第4步：完成 -----------------
                    # 只有在这张图所有的节点都走完了，且没有触发重置时
                    if not need_replan and len(completed_tasks) == len(nodes):
                        await queue.put(
                            f"data: {json.dumps({'type': 'log', 'content': '🎉 **[任务圆满完成]** 所有的规划已生成并校验通过。'})}\n\n")
                        full_plan_text = ""  # 用于收集完整的正文

                        for n in nodes:
                            piece = current_plan_pieces.get(n['id'], '')
                            if piece:
                                full_plan_text += piece
                                await queue.put(
                                    f"data: {json.dumps({'type': 'answer_piece', 'content': piece})}\n\n")
                                await asyncio.sleep(0.05)

                        # 此时full_plan_text已经包含了所有任务的内容
                        await queue.put(f"data: {json.dumps({'type': 'log', 'content': '🗂️ 正在转化可视化沙盘数据...'})}\n\n")
                        # 将累加后的全文发给extractor
                        timeline_json_str = await asyncio.to_thread(extractor.action, full_plan_text, True)

                        try:
                            # 查找字符串中第一个'{'到最后一个'}'的内容，过滤掉前后可能存在的废话
                            json_match = re.search(r'(\{.*\})', timeline_json_str, re.DOTALL)
                            if json_match:
                                clean_json_str = json_match.group(1)
                                timeline_data = json.loads(clean_json_str)
                                # 确保数据结构符合前端预期
                                if "days" in timeline_data:
                                    await queue.put(
                                        f"data: {json.dumps({'type': 'timeline_data', 'content': timeline_data})}\n\n")
                            else:
                                raise ValueError("No JSON found")
                        except Exception as e:
                            await queue.put(
                                f"data: {json.dumps({'type': 'log', 'content': f'⚠️ 沙盘数据结构化失败，尝试降级渲染...'})}\n\n")

                        return  # 直接退出，结束整个流程

                await queue.put(
                    f"data: {json.dumps({'type': 'error', 'content': '❌ **[系统中止]** 连续多次规划失败，请尝试修改您的主诉求。'})}\n\n")

            except Exception as e:
                await queue.put(f"data: {json.dumps({'type': 'error', 'content': f'系统错误: {str(e)}'})}\n\n")

            finally:
                await queue.put(None)

        tdag_task = asyncio.create_task(execute_tdag())

        try:
            while True:
                msg = await queue.get()
                if msg is None:
                    break
                yield msg
        except asyncio.CancelledError:
            print("客户端已断开连接，正在紧急终止后台 Agent 任务...")
            tdag_task.cancel()   # 强行杀死后台任务，释放线程池和API额度！
            raise  # 向上抛出异常，结束流
        except Exception as e:
            print(f"流生成器发生未知错误: {e}")

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/api/profile/add")
def add_user_profile():
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()

        today = datetime.now().strftime("%Y/%m/%d")
        cursor.execute(
            "INSERT INTO travel_profiles (date, destination, attractions, cost) VALUES (?, ?, ?, ?)",
            (today, "新目的地", "点击输入景点...", 0.0)
        )
        conn.commit()
        conn.close()

        return {"status": "success", "message": "新增空记录成功"}
    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail="数据库操作失败")


@app.post("/api/profile/delete")
def delete_user_profile(item: ProfileDeleteItem):
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        # 执行删除语句
        cursor.execute("DELETE FROM travel_profiles WHERE id=?", (item.id,))
        conn.commit()

        if cursor.rowcount == 0:
            conn.close()
            raise HTTPException(status_code=404, detail="未找到该条记录")

        conn.close()
        return {"status": "success", "message": "删除成功"}

    except sqlite3.Error as e:
        raise HTTPException(status_code=500, detail="数据库操作失败")


if __name__ == "__main__":
    import uvicorn
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host=host, port=port)
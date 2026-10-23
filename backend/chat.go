package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"sync"

	openai "github.com/sashabaranov/go-openai"
)

// chatRequest 与旧 Python 版请求契约一致。
type chatRequest struct {
	Prompt string  `json:"prompt"`
	Region string  `json:"region"`
	Image  *string `json:"image"`
}

// tdagNode 是规划师生成的任务节点。
type tdagNode struct {
	ID        string   `json:"id"`
	Task      string   `json:"task"`
	DependsOn []string `json:"depends_on"`
}

type planGraph struct {
	Nodes []tdagNode `json:"nodes"`
}

type validationResult struct {
	Score     float64 `json:"score"`
	Suggestion string `json:"suggestion"`
}

const textBigwords = "【核心实体加粗】：包括但不限于景点名、酒店名、餐厅名"

var extractorJSONRe = regexp.MustCompile(`(?s)\{.*\}`)

// handleChat 实现多智能体 TDAG 引擎并通过 SSE 推送过程。
func handleChat(w http.ResponseWriter, r *http.Request) {
	var req chatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"detail":"请求格式错误"}`, http.StatusBadRequest)
		return
	}

	deepseek, qwen, err := llmClients()
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"detail":%q}`, err.Error()), http.StatusInternalServerError)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, `{"detail":"流式响应不被支持"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	events := make(chan SSEEvent, 64)
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		runTDAG(ctx, req, deepseek, qwen, events)
		close(events)
	}()

loop:
	for {
		select {
		case ev, ok := <-events:
			if !ok {
				break loop
			}
			data, _ := json.Marshal(ev)
			fmt.Fprintf(w, "data: %s\n\n", data)
			flusher.Flush()
		case <-ctx.Done():
			break loop
		}
	}
}

// runTDAG 执行"规划→调度→校验→结构化"的多智能体流水线。
func runTDAG(ctx context.Context, req chatRequest, deepseek, qwen *openai.Client, events chan<- SSEEvent) {
	planner := newSmartAgent(AgentProfile{
		"行程分解师",
		"将复杂的旅行需求拆解为TDAG（有向无环图）结构。",
		`输出严格的JSON格式：
            {
              "nodes": [
                {"id": "T1", "task": "明确出游日期和总预算", "depends_on": []},
                {"id": "T2", "task": "查询特色酒店", "depends_on": ["T1"]},
                {"id": "T3", "task": "查询核心景点门票与交通", "depends_on": ["T1"]},
                {"id": "T4", "task": "规划每日游玩路线并校验", "depends_on": ["T2", "T3"]}
              ]
            }
            注意：没有依赖的任务 depends_on 为空列表；相互独立的任务必须并行。`,
	}, deepseek, "deepseek-chat", req.Region, req.Prompt)

	executor := newSmartAgent(AgentProfile{
		fmt.Sprintf("%s资源专家", req.Region),
		"根据目的地信息提供具体的酒店、交通和景点细节",
		"必须包含实时估算的交通时长和门票参考。重要约束：由于你是多智能体流水线上的一个中间节点。严禁在结尾输出任何总结语、客套话、或者反问句（例如'是否需要我为您生成...'、'如果需要调整请告诉我...'、'九、总结'等）" + textBigwords,
	}, qwen, "qwen-turbo", req.Region, req.Prompt)

	validator := newSmartAgent(AgentProfile{
		"方案校验员", "负责检查行程的可行性（如时间冲突、路线是否绕路、预算超支）",
		"输出JSON: {'score': 0-100, 'suggestion': '...'}",
	}, deepseek, "deepseek-chat", req.Region, req.Prompt)

	extractor := newSmartAgent(AgentProfile{
		"数据结构化大师",
		"你的唯一任务是从提供的一篇游玩攻略中，提取出每日的行程安排，并结合你的真实世界地理常识，为每个核心地点补充高德地图的经纬度坐标，转化为严格的 JSON 格式。",
		`必须输出如下格式的 JSON（不要带其他废话）：
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
            2. 只输出纯 JSON 字符串，不含任何 Markdown 标记。`,
	}, deepseek, "deepseek-chat", req.Region, req.Prompt)

	vision := &VisionAgent{client: qwen, modelName: "qwen-vl-plus"}

	enhancedPrompt := req.Prompt

	// 图片前置处理
	if req.Image != nil && *req.Image != "" {
		events <- eventOf("log", "👁️ **[Vision Agent]** 正在通过照片定位您的灵感景点...")
		result, err := vision.analyzeImage(ctx, *req.Image)
		if err == nil {
			enhancedPrompt = fmt.Sprintf("【图片灵感：%s】。用户上传了一张照片，请务必在行程中包含或参考此地点：%s。其他要求：%s", result, result, req.Prompt)
			events <- eventOf("log", fmt.Sprintf("✨ **[识别成功]** 发现灵感：%s", result))
		} else {
			events <- eventOf("log", "⚠️ 视觉识别失败，将按纯文本需求继续规划。")
		}
		planner.corePrompt = enhancedPrompt
		executor.corePrompt = enhancedPrompt
	}

	const maxGlobalRetries = 5
	suggestion := ""

	for planAttempt := 0; planAttempt < maxGlobalRetries; planAttempt++ {
		if planAttempt > 0 {
			events <- eventOf("log", fmt.Sprintf("🔄 **[全局重置]** 正在进行第 %d 次全局重新规划...", planAttempt+1))
		} else {
			logMsg := fmt.Sprintf("🧭 **[TDAG 构建]** 正在为【%s】构建任务图...", req.Region)
			if req.Image != nil && *req.Image != "" {
				logMsg = "🧭 **[灵感融合]** 已将照片景点注入 TDAG，正在生成最优路径..."
			}
			events <- eventOf("log", logMsg)
		}

		promptForPlanner := fmt.Sprintf("主诉求：%s。请拆解任务。", enhancedPrompt)
		if planAttempt > 0 && suggestion != "" {
			promptForPlanner += fmt.Sprintf(" 注意，上一次规划在节点执行时失败了，原因是：%s。请在此次规划中规避此问题。", suggestion)
		}

		rawPlan, err := planner.action(ctx, promptForPlanner, true)
		if err != nil {
			events <- eventOf("error", fmt.Sprintf("系统错误: %v", err))
			return
		}
		var plan planGraph
		if err := json.Unmarshal([]byte(rawPlan), &plan); err != nil {
			suggestion = "规划师输出不是合法 JSON：" + err.Error()
			continue
		}
		nodes := plan.Nodes

		completed := map[string]bool{}
		needReplan := false
		pieces := map[string]string{}
		var piecesMu sync.Mutex
		finalItinerary := ""

		// TDAG 调度引擎：按依赖分层，同层并发
		for len(completed) < len(nodes) {
			if ctx.Err() != nil {
				return
			}
			var layer []tdagNode
			for _, n := range nodes {
				if completed[n.ID] {
					continue
				}
				ready := true
				for _, dep := range n.DependsOn {
					if !completed[dep] {
						ready = false
						break
					}
				}
				if ready {
					layer = append(layer, n)
				}
			}
			if len(layer) == 0 {
				events <- eventOf("log", "⚠️ **[调度异常]** 检测到图结构存在死锁，尝试重新规划！")
				needReplan = true
				break
			}

			type nodeResult struct {
				id         string
				success    bool
				suggestion string
			}
			results := make([]nodeResult, len(layer))
			var wg sync.WaitGroup
			for i, node := range layer {
				wg.Add(1)
				go func(i int, n tdagNode) {
					defer wg.Done()
					events <- eventOf("log", fmt.Sprintf("🛠️ **[执行]** [%s] %s", n.ID, n.Task))

					content, err := executor.action(ctx, fmt.Sprintf("针对 %s 规划环节：%s。", req.Region, n.Task), false)
					if err != nil {
						results[i] = nodeResult{n.ID, false, "执行节点失败：" + err.Error()}
						return
					}

					events <- eventOf("log", fmt.Sprintf("🔍 **[校验]** [%s] 正在校验合理性...", n.ID))
					validationPrompt := fmt.Sprintf(`
                            请严格评审以下行程规划：%s

                            【评审宽容度规则】
                            1. 预算弹性：允许总预算有 10%% ~ 15%% 的合理上浮。例如目标预算 5000，只要在 5750 以内，且行程体验极佳，在预算项上依然可以给满分。
                            2. 时间弹性：如果单日行程稍微紧凑，只要物理上可行（如打车能赶到），请不要判定为死锁错误，可以扣少量分数并给出提示即可。
                            3. 核心原则：除非出现严重的逻辑矛盾（如同一时间出现在两地、预算超标 50%% 以上、强依赖未完成），否则请尽量给出 80 分以上的通过成绩。

                            给出评分（score）和建议（suggestion）。`, content)

					valRaw, err := validator.action(ctx, validationPrompt, true)
					if err != nil {
						results[i] = nodeResult{n.ID, false, "校验节点失败：" + err.Error()}
						return
					}
					var val validationResult
					if err := json.Unmarshal([]byte(valRaw), &val); err != nil {
						results[i] = nodeResult{n.ID, false, "校验输出无法解析为 JSON"}
						return
					}
					if val.Score >= 80 {
						sectionMD := fmt.Sprintf("<div class=\"task-header-card\">📌 任务 %s：%s</div>\n\n%s\n\n---\n\n", n.ID, n.Task, content)
						piecesMu.Lock()
						pieces[n.ID] = sectionMD
						piecesMu.Unlock()
						if containsItinerary(n.Task) {
							finalItinerary = content
						}
						results[i] = nodeResult{n.ID, true, ""}
					} else {
						s := val.Suggestion
						if s == "" {
							s = "无"
						}
						results[i] = nodeResult{n.ID, false, s}
					}
				}(i, node)
			}
			wg.Wait()

			for _, res := range results {
				if res.success {
					completed[res.id] = true
				} else {
					events <- eventOf("log", fmt.Sprintf("⚠️ **[第 %d 次校验失败]   ** 原因：%s", planAttempt+1, res.suggestion))
					suggestion = res.suggestion
					needReplan = true
					break
				}
			}
			if needReplan {
				break
			}
		}

		if !needReplan && len(completed) == len(nodes) {
			events <- eventOf("log", "🎉 **[任务圆满完成]** 所有的规划已生成并校验通过。")
			fullPlanText := ""
			for _, n := range nodes {
				piece, ok := pieces[n.ID]
				if !ok || piece == "" {
					continue
				}
				fullPlanText += piece
				events <- eventOf("answer_piece", piece)
			}
			_ = finalItinerary

			events <- eventOf("log", "🗂️ 正在转化可视化沙盘数据...")
			timelineRaw, err := extractor.action(ctx, fullPlanText, true)
			if err == nil {
				if m := extractorJSONRe.FindString(timelineRaw); m != "" {
					var timeline any
					if json.Unmarshal([]byte(m), &timeline) == nil {
						events <- eventOf("timeline_data", timeline)
					}
				} else {
					events <- eventOf("log", "⚠️ 沙盘数据结构化失败，尝试降级渲染...")
				}
			} else {
				events <- eventOf("log", "⚠️ 沙盘数据结构化失败，尝试降级渲染...")
			}
			return
		}
	}

	events <- eventOf("error", "❌ **[系统中止]** 连续多次规划失败，请尝试修改您的主诉求。")
}

func containsItinerary(task string) bool {
	return strings.Contains(task, "行程规划") || strings.Contains(task, "行程")
}

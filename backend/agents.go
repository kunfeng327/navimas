package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"regexp"
	"strings"
	"sync"

	openai "github.com/sashabaranov/go-openai"
)

// ---------- .env 支持 ----------

// loadEnvFile 在启动时读取 backend/.env（若存在），把 KEY=VALUE 注入环境变量。
// 已存在的环境变量优先，不会被 .env 覆盖。
func loadEnvFile() {
	data, err := os.ReadFile(".env")
	if err != nil {
		return
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		k, v = strings.TrimSpace(k), strings.TrimSpace(v)
		v = strings.Trim(v, `"'`)
		if os.Getenv(k) == "" {
			os.Setenv(k, v)
		}
	}
}

// ---------- LLM 客户端 ----------

func newClient(apiKey, baseURL string) *openai.Client {
	config := openai.DefaultConfig(apiKey)
	config.BaseURL = baseURL
	return openai.NewClientWithConfig(config)
}

// 文本模型与视觉模型名称：智谱走 ZHIPU_KEY 分支，否则用 DeepSeek+通义
var (
	textModel   = "deepseek-chat"
	visionModel = "qwen-vl-plus"
)

func llmClients() (deepseek, qwen *openai.Client, err error) {
	// 优先智谱：一个 Key 同时承担文本与视觉
	if zk := os.Getenv("ZHIPU_KEY"); zk != "" {
		textModel = "glm-4-flash"
		visionModel = "glm-4v-flash"
		c := newClient(zk, "https://open.bigmodel.cn/api/paas/v4")
		return c, c, nil
	}
	dk := os.Getenv("DEEPSEEK_KEY")
	qk := os.Getenv("QWEN_KEY")
	dsClient := newClient(dk, "https://api.deepseek.com")
	qwClient := newClient(qk, "https://dashscope.aliyuncs.com/compatible-mode/v1")
	switch {
	case dk != "" && qk != "":
		// 双模型分工：DeepSeek 规划/校验，Qwen 执行/识图
	case dk != "":
		// 只填 DeepSeek：全部走 DeepSeek（无视觉能力，传图会降级为纯文本）
		textModel = "deepseek-chat"
		qwClient = dsClient
	case qk != "":
		// 只填通义：全部走通义
		textModel = "qwen-turbo"
		visionModel = "qwen-vl-plus"
		dsClient = qwClient
	default:
		return nil, nil, errors.New("请在 backend/.env 中填写 ZHIPU_KEY，或 DEEPSEEK_KEY / QWEN_KEY（至少一个）")
	}
	return dsClient, qwClient, nil
}

// ---------- Agent Profile / Memory ----------

// AgentProfile 描述智能体的角色、目标与约束。
type AgentProfile struct {
	Role, Goal, Constraints string
}

func (p AgentProfile) systemPrompt() string {
	return fmt.Sprintf("你是%s。你的目标是%s。遵守约束：%s", p.Role, p.Goal, p.Constraints)
}

// AgentMemory 保存最近 windowSize*2 条对话作为上下文。
type AgentMemory struct {
	mu         sync.Mutex
	history    []openai.ChatCompletionMessage
	windowSize int
}

func (m *AgentMemory) addRecord(role, content string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.history = append(m.history, openai.ChatCompletionMessage{Role: role, Content: content})
}

func (m *AgentMemory) context() []openai.ChatCompletionMessage {
	m.mu.Lock()
	defer m.mu.Unlock()
	n := m.windowSize * 2
	if n <= 0 || len(m.history) <= n {
		out := make([]openai.ChatCompletionMessage, len(m.history))
		copy(out, m.history)
		return out
	}
	out := make([]openai.ChatCompletionMessage, n)
	copy(out, m.history[len(m.history)-n:])
	return out
}

// ---------- SmartAgent ----------

var markdownJSONRe = regexp.MustCompile("```json\\n?|\\n?```")

// SmartAgent 封装带角色设定与短期记忆的 LLM 调用。
type SmartAgent struct {
	profile    AgentProfile
	client     *openai.Client
	modelName  string
	memory     *AgentMemory
	region     string
	corePrompt string
}

func newSmartAgent(profile AgentProfile, client *openai.Client, model, region, corePrompt string) *SmartAgent {
	return &SmartAgent{
		profile:    profile,
		client:     client,
		modelName:  model,
		memory:     &AgentMemory{windowSize: 3},
		region:     region,
		corePrompt: corePrompt,
	}
}

// action 执行一次对话调用；isJSON 为 true 时请求 JSON 输出并清洗 Markdown 标记。
// 可选 maxTokens 限制输出长度（用于校验/规划等短输出场景，加快响应）。
func (a *SmartAgent) action(ctx context.Context, userPrompt string, isJSON bool, maxTokens ...int) (string, error) {
	enhancedSystem := fmt.Sprintf("%s\n【行程背景】目的地：%s；用户核心诉求：%s",
		a.profile.systemPrompt(), a.region, a.corePrompt)

	messages := []openai.ChatCompletionMessage{{Role: openai.ChatMessageRoleSystem, Content: enhancedSystem}}
	messages = append(messages, a.memory.context()...)
	messages = append(messages, openai.ChatCompletionMessage{Role: openai.ChatMessageRoleUser, Content: userPrompt})

	req := openai.ChatCompletionRequest{
		Model:       a.modelName,
		Messages:    messages,
		Temperature: 0.7,
	}
	if len(maxTokens) > 0 && maxTokens[0] > 0 {
		req.MaxTokens = maxTokens[0]
	}
	if isJSON {
		req.ResponseFormat = &openai.ChatCompletionResponseFormat{Type: openai.ChatCompletionResponseFormatTypeJSONObject}
	}

	resp, err := a.client.CreateChatCompletion(ctx, req)
	if err != nil {
		return "", err
	}
	if len(resp.Choices) == 0 {
		return "", errors.New("LLM 返回空结果")
	}
	content := resp.Choices[0].Message.Content
	if isJSON {
		content = strings.TrimSpace(markdownJSONRe.ReplaceAllString(content, ""))
	}
	a.memory.addRecord(openai.ChatMessageRoleAssistant, content)
	return content, nil
}

// ---------- VisionAgent ----------

// VisionAgent 使用多模态模型识别图片中的景点。
type VisionAgent struct {
	client    *openai.Client
	modelName string
}

func (v *VisionAgent) analyzeImage(ctx context.Context, base64Image string) (string, error) {
	if !strings.HasPrefix(base64Image, "data:image") {
		if i := strings.Index(base64Image, ","); i >= 0 {
			base64Image = base64Image[i+1:]
		}
		base64Image = "data:image/jpeg;base64," + base64Image
	}

	resp, err := v.client.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
		Model: v.modelName,
		Messages: []openai.ChatCompletionMessage{{
			Role: openai.ChatMessageRoleUser,
			MultiContent: []openai.ChatMessagePart{
				{Type: openai.ChatMessagePartTypeText, Text: "识别图片中的旅游景点或城市，并给出具体的地点名称。如果无法确定精确地点，请描述其地理特征（如：海滨、古镇、雪山）。输出格式：地点：[地点名称]；特征：[特征描述]"},
				{Type: openai.ChatMessagePartTypeImageURL, ImageURL: &openai.ChatMessageImageURL{URL: base64Image}},
			},
		}},
		MaxTokens: 300,
	})
	if err != nil {
		return "", err
	}
	if len(resp.Choices) == 0 {
		return "", errors.New("视觉模型返回空结果")
	}
	return resp.Choices[0].Message.Content, nil
}

// ---------- SSE 事件 ----------

// SSEEvent 是推送给前端的事件结构，与旧 Python 版契约一致。
type SSEEvent struct {
	Type    string          `json:"type"`
	Content json.RawMessage `json:"content"`
}

// eventOf 构造一个 SSE 事件，content 为任意可序列化值。
func eventOf(typ string, v any) SSEEvent {
	return SSEEvent{Type: typ, Content: mustJSON(v)}
}

func mustJSON(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}

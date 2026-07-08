# Target 配置指南

Agent Redteam 支持 8 种目标适配器，通过 CLI 的 `--target` 选择，或在 Python API 里
直接实例化对应的 Target 类。

| 目标 | `--target` | Python 类 |
|------|-----------|-----------|
| OpenAI 兼容 | `openai` | `OpenAITarget` |
| Anthropic Claude | `claude` | `ClaudeTarget` |
| Z.ai（智谱 GLM） | `zai` | `ZaiTarget` |
| Ollama | `ollama` | `OllamaTarget` |
| DeepSeek | `deepseek` | `DeepSeekTarget` |
| Azure OpenAI | `azure` | `AzureTarget` |
| 通义千问 | `qwen` | `QwenTarget` |
| 本地 Agent | `local` | `LocalTarget` |

所有 target 类都实现同一个接口：`send(messages: list[dict]) -> str`。

## OpenAI 兼容 (`openai`)

OpenAI 官方 API，或任意 OpenAI 格式端点（vLLM、自建代理等）。

```bash
agent-redteam scan --target openai --model gpt-4o --key $OPENAI_API_KEY
```

```python
from agent_redteam.targets import OpenAITarget
target = OpenAITarget(model="gpt-4o", api_key="sk-...", base_url="https://api.openai.com/v1", max_tokens=500)
```

key 缺省时读取 `OPENAI_API_KEY` 环境变量；两者都没有会抛 `ValueError`。

## Anthropic Claude (`claude`)

```bash
agent-redteam scan --target claude --model claude-3-5-sonnet-20241022 --key $ANTHROPIC_API_KEY
```

```python
from agent_redteam.targets import ClaudeTarget
target = ClaudeTarget(model="claude-3-5-sonnet-20241022", api_key="sk-ant-...")
```

key 缺省时读取 `ANTHROPIC_API_KEY`。base URL 默认 `https://api.anthropic.com`。

## Z.ai / 智谱 GLM (`zai`)

```bash
agent-redteam scan --target zai --model GLM-5.2 --key $ZAI_API_KEY
```

```python
from agent_redteam.targets import ZaiTarget
target = ZaiTarget(model="GLM-5.2", api_key="...", proxy="")
```

key 缺省时读取 `ZAI_API_KEY`。走 Z.ai 的 Anthropic 兼容端点
（`https://api.z.ai/api/anthropic`），可选 `proxy` 参数走本地代理。README 里的
真实验证数据（GLM-5.2 / GLM-4.5 / GLM-4-Flash）都是通过这个 target 跑的，
详见 [安全基准](benchmark.md)。

## Ollama (`ollama`)

本地开源模型，无需 API key，完全免费、完全可复现。

```bash
ollama pull qwen2.5:0.5b
agent-redteam scan --target ollama --model qwen2.5:0.5b --limit 10
```

```python
from agent_redteam.targets import OllamaTarget
target = OllamaTarget(model="llama3", base_url="http://localhost:11434", temperature=0)
```

默认 `base_url` 指向本地 `11434` 端口。见 [安全基准](benchmark.md) 里的
qwen2.5/llama3.2 本地基准数据。

## DeepSeek (`deepseek`)

```bash
agent-redteam scan --target deepseek --model deepseek-chat --key $DEEPSEEK_API_KEY
```

```python
from agent_redteam.targets import DeepSeekTarget
target = DeepSeekTarget(model="deepseek-chat", api_key="...")
```

key 缺省时读取 `DEEPSEEK_API_KEY`。也支持 `deepseek-reasoner`。

## Azure OpenAI (`azure`)

```python
from agent_redteam.targets import AzureTarget
target = AzureTarget(deployment="my-gpt4o-deployment", endpoint="https://xxx.openai.azure.com", api_key="...")
```

`endpoint` 缺省时读取 `AZURE_OPENAI_ENDPOINT`，`api_key` 缺省时读取
`AZURE_OPENAI_API_KEY`。注意 Azure 用的是部署名（deployment）而不是模型 ID。

## 通义千问 (`qwen`)

```bash
agent-redteam scan --target qwen --model qwen-plus --key $DASHSCOPE_API_KEY
```

```python
from agent_redteam.targets import QwenTarget
target = QwenTarget(model="qwen-plus", api_key="...")
```

key 缺省时读取 `DASHSCOPE_API_KEY`。走阿里 DashScope 的 OpenAI 兼容模式端点。
支持 `qwen-turbo` / `qwen-plus` / `qwen-max`。

## 本地 Agent (`local`)

任意 HTTP 端点，最通用的适配方式——把你自己的 agent 服务包一层就能测。

```bash
agent-redteam scan --target local --endpoint http://localhost:8000/chat
```

```python
from agent_redteam.targets import LocalTarget
target = LocalTarget(endpoint="http://localhost:8000/chat", model="my-agent")
```

请求体格式：`{"message": <最后一条 user 消息>, "messages": <完整对话历史>}`，
你的端点需要返回纯文本响应。

## 自定义 Target

不在上面列表里的 provider？实现 `Target` 抽象基类即可：

```python
from agent_redteam.targets.base import Target

class MyTarget(Target):
    model = "my-model"
    def send(self, messages: list[dict]) -> str:
        # messages: [{"role": "user"/"system"/"assistant", "content": "..."}]
        return call_my_api(messages)
```

然后 `Engine(MyTarget())` 直接用，不需要改核心代码。

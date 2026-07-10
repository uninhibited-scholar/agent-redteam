# Python API 参考

```python
from agent_redteam import Engine, ScanReport, SuiteResult, SampleResult, Verdict
```

## 最小示例

```python
from agent_redteam import Engine
from agent_redteam.targets import OpenAITarget

target = OpenAITarget(model="gpt-4o", base_url="https://api.openai.com/v1", api_key="sk-...")
engine = Engine(target)
report = engine.scan()
print(report.summary())
assert report.overall_score >= 80
```

## `Engine`

主编排器：注册套件（内置 13 个套件会自动注册）、跑扫描、产出 `ScanReport`。

```python
class Engine:
    def __init__(self, target, max_workers: int = 4, max_attempts: int = 3): ...

    def register_suite(self, suite) -> None:
        """注册自定义套件（须有 name / load_samples() / build_messages() / check）。"""

    def list_suites(self) -> list[str]:
        """已注册套件名，字母序。"""

    def scan(self, suites: list[str] | None = None, on_result=None) -> ScanReport:
        """跑扫描，返回 ScanReport。

        suites: 只跑这些套件（默认全部）
        on_result: 每条样本出结果时的回调 callback(SampleResult)，用于实时更新（Dashboard/TUI 用这个）
        """
```

只跑部分套件：

```python
report = engine.scan(suites=["injection", "info_leak"])
```

实时回调（比如推给 WebSocket 或进度条）：

```python
def on_result(sample_result):
    print(f"{sample_result.suite}/{sample_result.sample_id}: {sample_result.verdict}")

report = engine.scan(on_result=on_result)
```

扫描内置检查点支持（`~/.agent-redteam/checkpoints/`）：

- 单轮样本和完整的多轮场景都会在完成后写入检查点；中断后以相同范围重跑会复用已判定的 `PASS` / `FAIL`。
- `ERROR` 视为临时失败，不会被当作完成；下次运行会自动重试。
- 检查点绑定非秘密 target 配置、model、套件、limit 之后的样本内容及判定实现；endpoint、数据、范围或检查逻辑变化不会误用旧结果。
- 只要报告仍含 `ERROR`，活动检查点就会保留；全部获得有效判定后才归档为 `.done`。
- 检查点可能包含模型响应，文件权限固定为 `0600`。不要将该目录提交到版本库。

## 自定义套件

套件需要提供 `name` / `load_samples()` / `build_messages(sample)` / `check`
（一个 `Check` 实例）：

```python
from agent_redteam.suites.base import Suite
from agent_redteam.checks.base import Check
from agent_redteam.core.result import Verdict

class MyCheck(Check):
    def evaluate(self, response: str, sample: dict) -> Verdict:
        return Verdict.PASS if "denied" in response.lower() else Verdict.FAIL

class MySuite(Suite):
    name = "my_suite"
    check = MyCheck()
    def load_samples(self):
        return [{"id": "1", "question": "..."}]
    def build_messages(self, sample):
        return [{"role": "user", "content": sample["question"]}]

engine.register_suite(MySuite())
report = engine.scan(suites=["my_suite"])
```

## `Target`

抽象基类，所有 target 适配器的接口：

```python
class Target(ABC):
    model: str = ""
    @abstractmethod
    def send(self, messages: list[dict]) -> str:
        """发送对话，返回响应文本。messages: [{"role": ..., "content": ...}, ...]"""
```

内置实现：`OpenAITarget` / `ClaudeTarget` / `ZaiTarget` / `OllamaTarget` /
`DeepSeekTarget` / `AzureTarget` / `QwenTarget` / `LocalTarget`，具体构造参数见
[Target 配置指南](targets.md)。自定义 target 只需继承 `Target` 并实现 `send()`。

## `Harness`

单轮套件的执行引擎（`src/agent_redteam/core/harness.py`），`Engine.scan()` 内部
使用，通常不需要直接调用：

```python
def load_jsonl(path: str) -> list[dict]:
    """加载 JSONL 文件为 dict 列表。"""

def send_message(target, messages: list[dict], max_attempts: int = 3) -> str:
    """带重试的发送；永久 4xx 立即失败，空响应/临时错误有上限退避。"""

class Harness:
    """跑一个套件的所有样本：ThreadPoolExecutor 并行 + 失败重试。"""
```

多轮套件（`multi_turn`）用的是单独的 `MultiTurnHarness`
（`src/agent_redteam/core/multiturn.py`），顺序执行完整对话场景。

## 数据模型（`core/result.py`）

### `Verdict`

```python
class Verdict(str, Enum):
    PASS = "pass"    # agent 抵御了攻击（安全行为）
    FAIL = "fail"    # agent 被攻破（脆弱行为）
    ERROR = "error"  # 无法判定（API 错误/超时等）
    SKIP = "skip"    # 样本被跳过（如断点续跑）
```

### `SampleResult`

单条攻击样本的完整结果：

```python
@dataclass
class SampleResult:
    suite: str
    sample_id: str
    category: str
    difficulty: str
    question: str          # 发给 agent 的攻击 payload
    expected: str           # agent 应该表现出的行为
    response: str           # agent 实际的响应
    verdict: Verdict
    severity: str = "medium"   # low/medium/high/critical
    owasp: str = ""            # OWASP LLM Top 10 映射，如 "LLM01"
    tags: list[str] = field(default_factory=list)
    error: str = ""            # verdict == ERROR 时有值
    metadata: dict = field(default_factory=dict)  # 额外数据（如多轮对话记录）

    @property
    def passed(self) -> bool: ...
    def to_dict(self) -> dict: ...  # response 截断到 500 字符（用于存储）
```

### `SuiteResult`

单个套件的聚合结果：

```python
@dataclass
class SuiteResult:
    name: str
    total: int = 0
    passed: int = 0
    failed: int = 0
    errors: int = 0
    skipped: int = 0
    samples: list[SampleResult] = field(default_factory=list)

    @property
    def score(self) -> float:
        """0-100，通过率。全部 ERROR 时返回 -1（无有效数据）。"""

    @property
    def pass_rate(self) -> float:
        """score / 100"""

    def add(self, r: SampleResult) -> None: ...
    def to_dict(self) -> dict: ...
```

### `ScanReport`

整次扫描的完整结果：

```python
@dataclass
class ScanReport:
    target_model: str = ""
    suites: list[SuiteResult] = field(default_factory=list)
    started_at: str = ""
    finished_at: str = ""

    @property
    def total_samples(self) -> int: ...
    @property
    def total_passed(self) -> int: ...
    @property
    def total_failed(self) -> int: ...

    @property
    def overall_score(self) -> float:
        """严重度加权平均：weight = critical:4, high:3, medium:2, low:1。
        ERROR 样本不计入分母。全部 ERROR 时返回 -1。"""
```

评分公式：

```
overall_score = 100 * sum(weight of passed samples) / sum(weight of all judged samples)
```

## 报告输出

```python
from agent_redteam.report.markdown_report import render_markdown
from agent_redteam.report.json_report import render_json
from agent_redteam.report.sarif_report import render_sarif
from agent_redteam.report.terminal import render_report

md = render_markdown(report)
json_str = render_json(report)
sarif = render_sarif(report)
render_report(report)  # 直接打印终端报告（默认 file=sys.stdout）
```

对应 CLI 的 `--format markdown/json/sarif`（terminal 是默认格式）。

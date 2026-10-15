# 领域文档

Engineering skills 探索 codebase 时，应如何消费这个 repo 的 domain documentation。

这个 repo 是 **single-context**：repo 根目录一个 `GLOSSARY.md`，架构决策记录在 `docs/architecture/decisions/`。

## 探索前先读取这些

- repo 根目录的 **`GLOSSARY.md`**
- **`docs/architecture/decisions/`**：读取与你即将处理区域相关的 ADRs

如果这些文件不存在，**静默继续**。不要标记缺失；不要提前建议创建。`/domain-modeling` skill（经由 `/grill-with-docs` 和 `/improve-codebase-architecture` 调用）会在 terms 或 decisions 实际被解决时懒创建它们。

## 文件结构

```
/
├── GLOSSARY.md
├── docs/
│   ├── architecture/decisions/     ← ADR（AGENTS.md §23 规定的路径）
│   │   ├── ADR-000-template.md
│   │   └── ADR-001-....md
│   └── agents/                     ← engineering skills 的仓库配置
├── apps/
└── packages/
```

ADR 命名沿用既有约定：`ADR-NNN-<slug>.md`，与 [ADR-000-template.md](../architecture/decisions/ADR-000-template.md) 一致。

## 使用 glossary 的词汇

当你的输出命名某个 domain concept 时（issue title、refactor proposal、hypothesis、test name），使用 `GLOSSARY.md` 中定义的 term。不要漂移到 glossary 明确避免的 synonyms。

如果你需要的概念还不在 glossary 中，这是一个信号：要么你正在发明项目没有使用的语言（重新考虑），要么确实存在缺口（为 `/domain-modeling` 记录）。

## 标记 ADR 冲突

如果你的输出与现有 ADR 矛盾，明确指出，而不是静默覆盖：

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_

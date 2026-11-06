# moye / 墨页

## Agent skills

### Issue tracker

Issues 与 spec 存放在 `zzl221000/moye` 的 GitHub Issues，用 `gh` CLI 操作。见 `docs/agents/issue-tracker.md`。

### Triage labels

五个 triage 角色与标签字符串同名（`needs-triage` 等）。见 `docs/agents/triage-labels.md`。

### Domain docs

单上下文：根目录 `GLOSSARY.md`，决策记录在 `docs/adr/`。见 `docs/agents/domain.md`。

## 界面约定

1. **可见文案只保留标签、状态与一句话错误；解释性句子不进界面。**
   反例：在「首页不显示页眉页脚」旁补一句「让封面保持干净」。
2. **功能靠结构与交互表达，不靠说明文字补足；辅助信息进 `title` / `aria-label` / 注释。**
   反例：在插入栏写「点击这里插入表格」，而不是给按钮加 `title="插入表格"`。
3. **克制优先：删掉不产生收益的控件；保留的控件必须有明确职责。**
   反例：保留加粗、斜体、标题按钮，而 live 呈现已给出反馈、键盘输入更快。

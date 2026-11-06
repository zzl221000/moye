# 混合结构基线

这份 fixture 覆盖导出链路上容易回归的块级与行内结构，页面数量本身不是重点，结构齐全才是。

## 标题层级

### 三级标题

标题用于确认字号、间距与断页行为。正文紧跟在标题之后，避免出现孤立的标题行。

## 无序列表

- 第一项：普通文本
- 第二项：包含**加粗**与 `行内代码`
- 第三项：包含一个较长的说明，用来观察列表项内部的换行
  - 嵌套项 A
  - 嵌套项 B

## 有序列表

1. 准备输入文档
2. 运行导出命令
3. 检查页数与文本

## 引用

> 引用段落的第一行。
> 引用段落的第二行，用来确认引用块的左边框与缩进。

## 表格

| 项目 | 数量 | 说明 |
| --- | ---: | --- |
| 纸张 | 1 | A4 纵向 |
| 页边距 | 36 | 单位 pt |
| 页脚 | 2 | 页码开关 |
| 主题 | 4 | paper / editorial / compact / dark |

## 代码块

```js
export function add(a, b) {
  return a + b;
}

console.log(add(1, 2));
```

## 任务列表

- [ ] 尚未完成的任务
- [x] 已经完成的任务

## 长 token

下面这个标识符没有任何可断行位置，用来验证长 token 不会撑破页面：

pkg_config_dependency_resolution_without_any_break_opportunity_0123456789abcdef

再给一个很长的链接地址：

https://example.com/a/very/long/path/that/should/not/break/the/page/layout/0123456789abcdef

## 图片

![本地像素图](assets/block.png)

图片来自 fixture 目录下的本地 PNG，不依赖网络；它同时验证相对路径经由 `/local/` 静态服务解析。

## 结尾

最后一段确认以上结构之后仍有正常正文，且页面在需要时自然结束。

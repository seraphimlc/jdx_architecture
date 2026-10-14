# BilionPass v2 批次 0 实施计划

> **给执行 agent：** 必读。建议用 subagent-driven-development 或 executing-plans 执行；步骤用 `- [ ]` 勾选跟踪。

**Goal:** 产出 BilionPass 架构图 v2 的批次 0 交付物——`00-总览.md`（含 L0 总图与 ID 注册表）、`01-业务视图.md`（图 1）、`02-能力视图.md`（图 2）、`03-关系矩阵.md`（M1–M4），并配一套可机械运行的校验脚本。

**Architecture:** 设计规格见 `docs/superpowers/specs/2026-09-28-bilionpass-v2-design.md`。核心思路是把"细度"与"关系"拆到不同载体：L0 总图当索引，图 1/图 2 承载两条叙事，全量关系交给矩阵。**唯一事实来源是 `docs/v2/00-总览.md` 里的 ID 注册表**，图、矩阵、文档都从它派生。

**Tech Stack:** Markdown + Mermaid（flowchart）；校验脚本为 Node.js ESM，**零依赖**；真 parser 校验用临时安装的 mermaid（不在仓库内落依赖）。

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `docs/v2/00-总览.md` | **ID 注册表的唯一事实来源**；L0 总图；图例 v2；变更清单；怎么读这套文档 |
| `docs/v2/01-业务视图.md` | 图 1：平台带 + 入口 + 应用系统 + 业务场景 |
| `docs/v2/02-能力视图.md` | 图 2：业务场景 + 服务能力 + 基础能力（含关键链路） |
| `docs/v2/03-关系矩阵.md` | M0 入口×应用系统、M1 场景×应用系统、M2 场景×服务能力、M3 服务能力×基础能力 |
| `docs/v2/templates/block.md` | 分块文档模板（批次 1 用） |
| `tools/check-mermaid.mjs` | 零依赖 Mermaid 结构校验（subgraph/end 配对、标签引号、ID 引用） |
| `tools/check-ids.mjs` | 零依赖 ID 一致性校验（注册表 ↔ 图 ↔ 矩阵，含矩阵取值合法性） |

---

## Chunk 1: 校验工具

### Task 1.1: Mermaid 结构校验脚本

**Files:** Create `tools/check-mermaid.mjs`

- [ ] **Step 1: 写脚本**——扫描给定 Markdown 文件里所有 ` ```mermaid ` 块，校验：① 有合法 diagram header；② `subgraph`/`end` 配平；③ 所有节点标签带引号；④ 边上引用的 ID 均已声明；⑤ `class` 引用的 classDef 与节点均已声明。
- [ ] **Step 2: 在无文档时运行，确认失败**
  Run: `node tools/check-mermaid.mjs docs/v2/00-总览.md`
  Expected: 非零退出，提示文件不存在（此时 `docs/v2/` 还没有文档）
- [ ] **Step 3: 文档写好后重跑**
  Run: `node tools/check-mermaid.mjs docs/v2/*.md`
  Expected: 每个 mermaid 块全部 PASS，退出码 0

### Task 1.2: ID 一致性校验脚本

**Files:** Create `tools/check-ids.mjs`

- [ ] **Step 1: 写脚本**——从 `docs/v2/00-总览.md` 解析 ID 注册表（表格行首列为 ID），然后校验：
  - ① 注册表数量：`EN` 14、`AP` 8、`BZ` 11、`SC` 9、`BA` 11；
  - ② 注册表里每个 ID 都出现在 `00-总览.md` 的 L0 总图中；
  - ③ 全仓库 `docs/v2/**/*.md` 中出现的每个 ID token 都在注册表里（抓错字/幽灵 ID）；
  - ④ `03-关系矩阵.md` 每张矩阵的行/列 ID 都在注册表里；
  - ⑤ 每张矩阵每格取值 ∈ `{●, ○, ?, ·}`，且行内单元格数量与表头一致。
- [ ] **Step 2: 无文档时运行，确认失败**
  Run: `node tools/check-ids.mjs`
  Expected: 非零退出，报告注册表缺失
- [ ] **Step 3: 文档写好后重跑**
  Run: `node tools/check-ids.mjs`
  Expected: 全部 PASS，退出码 0，并打印每张矩阵的 `?` 计数

---

## Chunk 2: 总览与 L0 总图

### Task 2.1: `docs/v2/00-总览.md`

**Files:** Create `docs/v2/00-总览.md`

- [ ] **Step 1: 写 ID 注册表**——5 张表（EN/AP/BZ/SC/BA），按规格 §5.1 逐行照抄；`EN-AI-04` 标注"预留"。
- [ ] **Step 2: 写 L0 总图**——Mermaid `flowchart TB`，含平台带 + 5 层；**每个注册 ID 都必须出现在图中**；SC/BA 的子项作为无 ID 的小节点画在各自分组内（结构与 v1 一致）。
- [ ] **Step 3: 写图例 v2**——颜色/形状沿用 v1；新增虚线语义（弱依赖 + AI 渠道）；新增 ID 标注说明；"说明"5 条的 v2 版（第 4 条补注"机制保留、当前全开"）。
- [ ] **Step 4: 写变更清单**——v2 相对 v1 的全部差异，含与 v1 的对应关系。
- [ ] **Step 5: 校验**
  Run: `node tools/check-mermaid.mjs docs/v2/00-总览.md && node tools/check-ids.mjs`
  Expected: PASS

## Chunk 3: 图 1 业务视图

### Task 3.1: `docs/v2/01-业务视图.md`

**Files:** Create `docs/v2/01-业务视图.md`

- [ ] **Step 1: 写图 1**——平台带 + 入口（按 C/B/A 分组，AI 渠道虚线）+ 应用系统 + 业务场景；入口→应用系统的**分组级连线**（subgraph→node 边，控制线数）；渠道类入口到 `AP-04` 的对接线单独画出。
- [ ] **Step 2: 写映射表**——逐条列出入口→应用系统的确定关系，与规格 §6 一致；不确定处标 `?`。
- [ ] **Step 3: 写讲解要点**——业务视角叙事（用户从哪进来、走什么场景）。
- [ ] **Step 4: 校验**
  Run: `node tools/check-mermaid.mjs docs/v2/01-业务视图.md && node tools/check-ids.mjs`
  Expected: PASS

## Chunk 4: 图 2 能力视图

### Task 4.1: `docs/v2/02-能力视图.md`

**Files:** Create `docs/v2/02-能力视图.md`

- [ ] **Step 1: 写图 2**——业务场景 → 服务能力（v1 的 10 条实线，含 `BZ-07` 汇入 `SC-06`、`BZ-11` 无出线）；服务能力 → 基础能力的**关键链路**用虚线，只画 2–3 条代表性链路。
- [ ] **Step 2: 写链路说明**——每条关键链路一段话，注明依据（v1 图例第 5 条 / 结构推断）。
- [ ] **Step 3: 校验**
  Run: `node tools/check-mermaid.mjs docs/v2/02-能力视图.md && node tools/check-ids.mjs`
  Expected: PASS

## Chunk 5: 关系矩阵

### Task 5.1: `docs/v2/03-关系矩阵.md`

**Files:** Create `docs/v2/03-关系矩阵.md`

- [ ] **Step 1: 写 M0 入口×应用系统**（14×8）、**M1 场景×应用系统**（11×8）、**M2 场景×服务能力**（11×9）、**M3 服务能力×基础能力**（9×11）。
- [ ] **Step 2: 每张矩阵标注证据来源**：M2 来自 v1 图上实线（**强证据**）；M0/M1 来自 v1 颜色规则推导（**中证据**）；M3 为结构推断（**弱证据**，不确定一律 `?`）。
- [ ] **Step 3: 写"待确认清单"**——汇总所有 `?` 格，按矩阵分组，方便作者一次性拍板。
- [ ] **Step 4: 校验**
  Run: `node tools/check-mermaid.mjs docs/v2/03-关系矩阵.md && node tools/check-ids.mjs`
  Expected: PASS，并打印各矩阵 `?` 计数

## Chunk 6: 收尾

### Task 6.1: 模板与索引

**Files:** Create `docs/v2/templates/block.md`; Modify `README.md`

- [ ] **Step 1: 写分块模板**（规格 §10 的通用 6 项 + 分层附加字段）。
- [ ] **Step 2: 更新 `README.md`**——指向 `docs/v2/`，加入批次状态。
- [ ] **Step 3: 全量校验**
  Run: `node tools/check-mermaid.mjs docs/v2/*.md && node tools/check-ids.mjs`
  Expected: 全部 PASS
- [ ] **Step 4: 真 parser 复核**——用 mermaid 12 的 `mermaid.parse` 跑一遍所有 mermaid 块（临时环境，依赖不入库）。
  Expected: 所有块 PARSE OK

---

## 提交

本仓库尚未 `git init`（作者未确认）。计划中的提交步骤**暂缓**；一旦建仓，按 Chunk 逐个提交，提交信息用 `docs(v2): ...`。

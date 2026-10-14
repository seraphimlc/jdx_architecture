# BilionPass 业务全景说明文档收尾实施计划

> **历史草稿，停止按此审批流程执行。** 用户于 2026-09-29 停用 superpowers；已授权文档收尾直接推进，进度以当前产物与交接记录为准。

> **给执行 agent：** 这是文档产物工作流，按任务顺序执行；每步完成后运行对应校验。

**目标：** 补齐 BilionPass 业务全景单文件 HTML 的说明内容，修复导航与生成完整性，并生成可独立分享的 `docs/site/index.html`。

**方法：** 以事实基座为唯一内容依据，在 `docs/site/content.mjs` 完成说明页数据，在 `docs/site/landscape.mjs` 修正大图实体口径，在 `tools/build-docs.mjs` 加入严格完整性校验和更清晰的说明页排版，最后重新生成并做结构核对。

**工具：** Node.js ESM、内联 CSS/JS、SVG；不引入新的运行时依赖。

## 文件结构

| 文件 | 责任 |
|---|---|
| `docs/site/content.mjs` | 业务事实、说明页、待确认项、事实清单 |
| `docs/site/landscape.mjs` | 全景图中的实体、状态、子图表 |
| `tools/build-docs.mjs` | 单文件 HTML 生成、路由、导航与完整性检查 |
| `docs/site/index.html` | 生成后的可分享产物 |

## Chunk 1：整理内容源

### Task 1.1：补齐所有实体说明页

**Files:** Modify `docs/site/content.mjs`

- [ ] 为业务、供给、中枢、端、出口、系统补齐富内容块；VIP 不建当前版页面，行程规划单独标为功能。
- [ ] 每块使用统一字段：`id`、`group`、`name`、`badge`、`oneliner`、`current`、`deps`、`next`、`judgment`、`open`、`source`。
- [ ] 所有未确认信息只放 `open`，并保留“待确认”措辞。
- [ ] 修正优惠券为东航 API 对接；退税包含 12/30 上线和支付宝 / 微信 / 银行卡出款链路；行程规划标为功能；AI / GEO 归入内容与获客。
- [ ] 清空 `pendingBlocks`，删除所有“【待补】”占位，避免已有说明页再次出现在待补导航。
- [ ] 以 canonical node registry 统一机场、端、出口和中枢职能的显示名与别名；删除与现有富内容页重叠的 pending 项，以及没有全景框的旧 B 端商户/VIP 项。

### Task 1.2：修正全景实体口径

**Files:** Modify `docs/site/landscape.mjs`

- [ ] 把“自建能力”作为可说明的供给节点；其状态和关系只写事实基座确认的内容。
- [ ] 保持大图每框只有实体名称、状态或关系标签。
- [ ] 确保状态和事实基座一致，尤其是优惠券的 API 形态与退税出款规划。

## Chunk 2：强化生成器完整性

### Task 2.1：生成前校验

**Files:** Modify `tools/build-docs.mjs`

- [ ] 检查节点名称重复、说明块重复和节点 ID 重复。
- [ ] 检查别名归一化后没有悬空节点、重复页面或同名不同页。
- [ ] 检查每个节点都有富内容页；缺失时抛出带名称的错误。
- [ ] 检查 `pendingBlocks` 为空；不为空时抛出错误。
- [ ] 检查成品数据不含“【待补】”，并检查每个页面的七个信息区都有内容或空状态提示。
- [ ] 检查导航链接只引用已生成的节点，并按名称去重。

### Task 2.2：说明页排版

**Files:** Modify `tools/build-docs.mjs`

- [ ] 将一句话结论、当前事实、依赖、下一步、判断、待确认、来源分成可识别的视觉区域。
- [ ] 保留现有 hash 路由、返回总览、SVG 子图和打印样式。
- [ ] 对空数组使用明确的“暂无已确认内容”提示，不生成空标题下的空列表。

## Chunk 3：生成与验证

### Task 3.1：生成产物

**Files:** Modify generated `docs/site/index.html`

- [ ] 运行 `node tools/build-docs.mjs`。
- [ ] 确认输出报告中说明页数、富内容页数、子图表数合理。

### Task 3.2：结构核对

- [ ] 用 Node 脚本统计 HTML 中导航 href 与页面 id，确认无重复和悬空引用。
- [ ] 核对全景图 `data-block` 与页面路由一一对应。
- [ ] 运行 `node tools/check-mermaid.mjs docs/v2/*.md`。
- [ ] 运行 `node tools/check-ids.mjs`。
- [ ] 用 Chrome 无头打开生成的 HTML，确认能独立载入并保存一次截图作为视觉检查证据。

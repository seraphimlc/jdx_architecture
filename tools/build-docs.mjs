#!/usr/bin/env node
// 文档编排工具：内容与图共用同一节点目录，生成可离线分享的单文件 HTML。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { meta, businesses, blocks as legacyBlocks, pendingBlocks, facts, taskPlan } from '../docs/site/content.mjs';
import * as L from '../docs/site/landscape.mjs';
import { architecture } from '../docs/site/architecture.mjs';
import { domainPlan } from '../docs/site/domain-services.mjs';
import { domainBlueprints } from '../docs/site/domain-blueprints.mjs';
import { projects, siteDemos } from '../docs/site/projects.mjs';
import { renderArchitecture, architectureCSS } from './render-architecture.mjs';
import { domainPlanScript } from './render-domain-plan.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs/site/index.html');
const maturityLabel = { complete: '已完成', existing: '运行中', planning: '规划中' };
const domainBlocks = domainPlan.domains.map(d => ({
  id: `domain-${d.id}`,
  group: '中枢职能',
  name: d.name,
  badge: `${maturityLabel[d.maturity]} · ${d.cycle}`,
  oneliner: d.purpose,
  audience: '平台各产品与业务',
  current: [d.current, `数据归属：${d.ownership}`],
  deps: { supply: [], hub: d.related.map(id => domainPlan.domains.find(x => x.id === id)?.name).filter(Boolean), distribution: [], related: [] },
  next: [d.plan],
  judgment: [`建议优先级：${d.priority}；建设周期：${d.cycle}。`],
  open: [d.question],
  blueprint: domainBlueprints[d.id],
  source: 'docs/site/domain-services.mjs；docs/site/domain-blueprints.mjs；本轮技术域架构规划'
}));
const platformSupportBlocks = [
  {
    id: 'foundation-open-platform', group: '技术底座', name: '开放平台', badge: '建议规划',
    oneliner: '统一承接合作方接入、API 开放、接口授权与调用管理。', audience: '合作方与平台运营人员',
    current: ['开放平台是合作方接入、API 开放和授权管理的建议底座能力；现有携程、东航、佐川、JTR、Jalan 等接入仍按各业务现状分别表达。'],
    deps: { supply: ['佐川物流', 'JTR', 'Jalan'], hub: [], distribution: ['外部渠道'], related: [] },
    next: ['建议规划按成交和资金分三层：链接跳转由合作方成交且资金不经过我方；H5 嵌入在我方页面成交且资金到我方；API 对接由渠道成交，渠道收款后按周期结算。目录、渠道开通、差异化定价、佣金和结算是规划能力，不写成已有模块。'], judgment: ['开放平台承接合作方接入；商户平台承接日本本地商户。两者不要并成一套接入体系。'],
    open: ['首期纳入哪些合作方和接口。', '接口授权、调用监测与异常重试由谁负责。', '渠道 × 内容 × 形态的开通记录由谁维护。'],
    source: 'docs/site/architecture.mjs；系统架构技术与数据底座规划'
  },
  {
    id: 'foundation-identity', group: '技术底座', name: '账号与权限', badge: '部分已有',
    oneliner: '承载旅客、商户、内部人员与合作方操作主体的账号、角色和访问权限。', audience: 'C 端、B 端、A 端及合作方操作人员',
    current: ['管理端已有渠道权限配置用途；会员域负责业务身份、等级和积分，账号与权限负责登录、角色和访问控制。'],
    deps: { supply: [], hub: ['会员域', '开放平台'], distribution: ['外部渠道', '社媒与 KOL'], related: [] },
    next: ['先梳理三端主体、角色和资源权限，再与会员身份、商户主体和合作方账号建立映射。'], judgment: [],
    open: ['三端账号是否统一。', '商户、内部人员、合作方的角色与资源范围。'],
    source: 'docs/site/architecture.mjs；系统架构技术与数据底座规划'
  },
  {
    id: 'foundation-data-assets', group: '技术底座', name: '数据资产平台', badge: '建议规划',
    oneliner: '建设面向商品、酒店、机票、用户日志等数据资产的大数据平台。', audience: '产品、运营、技术与管理分析人员',
    current: ['数据资产平台尚处规划阶段；现有商品、酒店、机票及用户日志数据分别产生于业务系统和外部合作方。'],
    deps: { supply: ['Jalan', 'JTR'], hub: ['商品域', '订单域', '会员域'], distribution: [], related: [] },
    next: ['先盘点数据来源、责任归属、更新频率和使用场景，再确定采集、治理、分析和数据服务范围。'], judgment: [],
    open: ['首期纳入哪些商品、酒店、机票和用户日志数据。', '明细数据、汇总数据和脱敏数据的访问边界。', '数据质量、保留周期和跨产品使用规则。'],
    source: 'docs/site/architecture.mjs；最新用户确认：数据资产平台属于规划中的技术底座能力。'
  },
];
const blocks = [...legacyBlocks.filter(b => b.group !== '中枢职能'), ...domainBlocks, ...platformSupportBlocks];
const projectById = new Map(projects.map(p => [p.id, p]));
const refAliases = {
  '商品与库存': '商品域',
  '订单与履约编排': '订单域',
  '资金与结算': '资金域',
  '分发与授权': '开放平台',
  '商户能力输出': '营销域',
  '内容与获客': '营销域',
  '风控与合规': '风控域',
  '主数据': '商品域',
};
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const md = s => esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
const slug = s => String(s).replace(/[\s/·（）()、，,]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
const clean = s => String(s).replace(/^[①②③④⑤⑥⑦⑧⑨]\s*/, '');
const canonical = clean;
const tone = s => /部分|手工|未完全|分阶段|对接中|已开发|待推广|浅实现/.test(s) ? 'partial' : /开发中|建设中/.test(s) ? 'dev' : /运营中|在跑|已上线|已确认|已打通|已接通|已对接|已接入|API 已接/.test(s) ? 'run' : 'plan';
const STATUS_COPY = [
  ['自研在跑', '自研运行中'],
  ['商品在跑', '商品运行中'],
  ['订单在跑', '订单运行中'],
  ['资金在跑', '资金运行中'],
  ['渠道在跑', '渠道运营中'],
  ['链接在跑', '链接服务运行中'],
  ['关西待上线', '关西机场尚未上线'],
  ['部分已开发', '部分完成开发'],
  ['部分已有', '部分具备'],
  ['在跑', '运营中'],
  ['已开发', '已完成开发'],
  ['规划中', '规划阶段'],
  ['开发中', '开发阶段'],
  ['对接中', '对接阶段'],
  ['未上线', '尚未上线'],
  ['浅实现', '初步实现'],
];
const statusLabel = s => STATUS_COPY.reduce((out, [from, to]) => out.replaceAll(from, to), String(s)).replaceAll('尚尚未上线', '尚未上线');
const badge = s => `<span class="badge ${tone(s)}"><i></i>${esc(statusLabel(s))}</span>`;
const allBiz = businesses.flatMap(g => g.items.map(it => ({ ...it, category: g.group })));
const platformBands = [
  { title: 'BilionPass 站点', mark: '01', prefix: 'site', items: L.stations, color: 'blue' },
  { title: '商户与管理端', mark: '02', prefix: 'end', items: L.ends, color: 'blue' },
  { title: '分发出口', mark: '03', prefix: 'exit', items: L.exits.map(g => ({ ...g, name: g.group })), color: 'blue' },
  { title: '产品与服务内容', mark: '04', prefix: 'b', items: allBiz, color: 'gold' },
  { title: '合作供给方', mark: '05', prefix: 'sup', items: L.suppliers, color: 'green' },
  { title: 'BilionPass 系统', mark: '06', prefix: 'sys', items: L.systems.map(s => ({ ...s, status: '在跑' })), color: 'slate' },
];
const shoppingBands = [
  { title: '行前购供给', mark: '01', prefix: 'sup', items: L.shoppingSuppliers, color: 'green' },
  { title: '行前购系统', mark: '02', prefix: 'sys', items: L.shoppingSystems.map(s => ({ ...s, status: '在跑' })), color: 'slate' },
];
const bands = [{ title: '并行产品', prefix: 'product', items: L.products, color: 'blue' }, ...platformBands, ...shoppingBands];
const nodes = bands.flatMap(g => g.items.map(n => ({ ...n, id: n.id ?? `${g.prefix}-${slug(n.name)}`, kind: g.title, diagram: true })));
const assert = (ok, message) => { if (!ok) throw new Error(`文档未生成：${message}`); };
const unique = (items, label) => {
  const seen = new Set();
  for (const item of items) { assert(!seen.has(item), `${label}重复「${item}」`); seen.add(item); }
};
unique(blocks.map(b => canonical(b.name)), '说明页名称');
unique(blocks.map(b => b.id), '内容 ID');
for (const b of blocks) {
  const name = canonical(b.name);
  let node = nodes.find(n => n.name === name);
  if (!node) { node = { id: `blk-${slug(b.name)}`, name, kind: /中枢/.test(b.group) ? '平台职能' : /底座/.test(b.group) ? '技术底座' : '补充说明', diagram: false }; nodes.push(node); }
  node.rich = b;
}
unique(nodes.map(n => n.id), '页面 ID');
unique(nodes.map(n => n.name), '节点名称');
const idOf = new Map(nodes.map(n => [n.name, n.id]));
const href = id => `#/b/${encodeURIComponent(id)}`;
const ref = name => {
  const target = refAliases[canonical(name)] ?? canonical(name);
  const id = idOf.get(target);
  assert(id, `依赖「${name}」没有对应说明页`);
  return `<a class="ref" href="${href(id)}">${esc(clean(target))}<span aria-hidden="true">↗</span></a>`;
};
assert(pendingBlocks.every(g => g.names.length === 0), '仍有待补说明页');
unique(projects.map(p => p.id), '项目 ID');
for (const p of projects) {
  assert(/^[a-z][a-z0-9-]+$/.test(p.id), `项目 ID 格式错误「${p.id}」`);
  for (const f of ['name', 'status', 'phase', 'summary', 'objective']) assert(typeof p[f] === 'string' && p[f].trim(), `项目「${p.id}」缺少 ${f}`);
  for (const f of ['scope', 'current', 'products', 'domains', 'dependencies', 'deliverables', 'decisions', 'open', 'acceptance', 'documents']) assert(Array.isArray(p[f]) && p[f].length, `项目「${p.id}」缺少 ${f}`);
  assert(p.documents.every(d => d.label && d.kind && d.href), `项目「${p.id}」资料链接格式错误`);
}
for (const task of taskPlan.tasks) assert(projectById.has(task.id), `任务「${task.id}」没有对应项目资料页`);
for (const n of nodes) {
  const b = n.rich;
  assert(b, `「${n.name}」缺少说明页内容`);
  for (const f of ['id', 'group', 'name', 'badge', 'oneliner', 'source']) assert(typeof b[f] === 'string' && b[f].trim(), `「${n.name}」缺少 ${f}`);
  for (const f of ['current', 'next', 'judgment', 'open']) assert(Array.isArray(b[f]) && b[f].every(x => typeof x === 'string' && x.trim()), `「${n.name}」的 ${f} 格式不完整`);
  assert(b.current.length, `「${n.name}」没有已确认事实`);
  if (/域$/.test(n.name)) assert(b.blueprint && b.blueprint.thesis && b.blueprint.functions?.length, `「${n.name}」缺少架构蓝图`);
  assert(b.deps && typeof b.deps === 'object', `「${n.name}」缺少依赖关系`);
  for (const values of Object.values(b.deps)) { assert(Array.isArray(values), `「${n.name}」依赖格式错误`); values.forEach(ref); }
  assert(!/【待补】/.test(JSON.stringify(b)), `「${n.name}」仍有待补占位`);
  // 未知、疑问与待确认信息只留在 open，不能伪装成事实或承诺。
  assert(!/待确认|【待补】/.test([...b.current, ...b.next].join('')), `「${n.name}」把未知放进了事实或下一步`);
}

const overviewNav = [
  ['ov', '01 整体业务与产品全景'],
  ['sites', '02 BilionPass 站点规划'],
  ['products', '03 各产品与服务架构'],
  ['open-platform', '04 ToB 渠道及开放平台'],
  ['merchant-ops', '05 商户与运营管理架构'],
  ['compliance', '06 技术、数据、安全与合规'],
  ['roadmap', '07 分阶段建设路线'],
];
const chapterGroups = [
  ['01 整体业务与产品全景', ['并行产品', '分发出口', '合作供给方']],
  ['02 BilionPass 站点规划', ['BilionPass 站点']],
  ['03 各产品与服务架构', ['产品与服务内容', 'BilionPass 系统', '行前购供给', '行前购系统']],
  ['04 ToB 渠道及开放平台', []],
  ['05 商户与运营管理架构', ['商户与管理端']],
  ['06 技术、数据、安全与合规', ['平台职能', '技术底座']],
  ['07 分阶段建设路线', []],
];
const chapterByName = { '综合平台 Portal 自有端': '03', '自建能力': '03', 'B 端商户': '05' };
function nav() {
  const placed = new Set();
  const sections = chapterGroups.map(([title, kinds]) => {
    const items = nodes.filter(n => {
      if (chapterByName[n.name]) return title.startsWith(chapterByName[n.name]);
      if (title.startsWith('04')) return n.name === '开放平台';
      if (title.startsWith('06')) return kinds.includes(n.kind) && n.name !== '开放平台';
      return kinds.includes(n.kind);
    });
    items.forEach(n => placed.add(n.id));
    return items.length ? `<div class="nav-group"><div class="nav-heading">${esc(title)} <span>${items.length}</span></div>${items.map(n => `<a href="${href(n.id)}">${esc(n.name)}</a>`).join('')}</div>` : '';
  }).join('');
  const rest = nodes.filter(n => !placed.has(n.id));
  const extra = rest.length ? `<div class="nav-group"><div class="nav-heading">补充说明 <span>${rest.length}</span></div>${rest.map(n => `<a href="${href(n.id)}">${esc(n.name)}</a>`).join('')}</div>` : '';
  const projectLinks = `<div class="nav-group project-nav"><div class="nav-heading">07 分阶段建设路线 · 项目 <span>${projects.length}</span></div>${projects.map(p => `<a href="#/project/${esc(p.id)}">${esc(p.name)}</a>`).join('')}</div>`;
  return `<div class="nav-heading">七章目录</div>${overviewNav.map(([id, name]) => `<a href="#/${id}">${esc(name)}</a>`).join('')}${sections}${projectLinks}${extra}`;
}
function nodeCard(n) {
  const node = nodes.find(x => x.name === n.name);
  return `<a class="land-node" data-block="${esc(node.id)}" href="${href(node.id)}"><strong>${esc(n.name)}</strong><div class="node-bottom">${badge(n.status ?? node.rich.badge)}${n.tag ? `<span class="tag">${esc(n.tag)}</span>` : ''}<span class="node-arrow" aria-hidden="true">↗</span></div></a>`;
}
function landscape(items) {
  return items.map(g => `<div class="land-band ${g.color}"><div class="band-label"><h3>${esc(g.title)}</h3></div><div class="land-grid ${g.prefix === 'sys' ? 'systems' : ''}">${g.items.map(nodeCard).join('')}</div></div>`).join('');
}
const dayMs = 24 * 60 * 60 * 1000;
const utcDate = iso => new Date(`${iso}T00:00:00Z`);
function renderTaskPlan() {
  const start = utcDate(taskPlan.range.start).getTime();
  const end = utcDate(taskPlan.range.end).getTime();
  const total = end - start + dayMs;
  const weeks = [];
  for (let time = start; time <= end; time += 7 * dayMs) {
    const date = new Date(time);
    weeks.push({ label: `${date.getUTCMonth() + 1}/${String(date.getUTCDate()).padStart(2, '0')}`, left: ((time - start) / total) * 100 });
  }
  const pct = iso => Math.max(0, Math.min(100, ((utcDate(iso).getTime() - start) / total) * 100));
  const rows = taskPlan.tasks.map(task => {
    const left = task.start ? pct(task.start) : null;
    const width = left === null ? null : Math.max(2.5, pct(task.end) - left);
    const open = task.open?.length ? `<div class="task-open"><b>待处理</b>${task.open.map(esc).join(' · ')}</div>` : '';
    const request = task.request ? `<div class="task-request"><b>外部请求</b>${esc(task.request)}</div>` : '';
    const schedule = left === null
      ? `<div class="task-target-label" style="left:${pct(task.end).toFixed(3)}%">${esc(task.target)}<small>起始日期及周计划待补充</small></div>`
      : `<div class="task-bar ${esc(task.tone)}" style="left:${left.toFixed(3)}%;width:${width.toFixed(3)}%"><span>${esc(task.target)}</span></div>`;
    return `<div class="task-row"><div class="task-meta"><strong><a href="#/project/${esc(task.id)}">${esc(task.name)}</a></strong><span>${esc(task.status)}</span>${open}${request}</div><div class="task-track">${schedule}<i class="task-milestone" style="left:${pct(task.end).toFixed(3)}%" title="${esc(task.name)} · ${esc(task.target)}"></i></div></div>`;
  }).join('');
  const weekLabels = weeks.map(w => `<span style="left:${w.left.toFixed(3)}%">${w.label}</span>`).join('');
  const shared = taskPlan.tasks.map(t => `<a class="task-card" href="#/project/${esc(t.id)}"><div><strong>${esc(t.name)}</strong>${badge(t.status)}</div><p>${esc(t.phase)}</p><small>目标：${esc(t.target)}　↗ 项目资料库</small></a>`).join('');
  return `<section id="tasks" class="task-plan"><header class="task-plan-heading"><div><div class="eyebrow">任务计划 / WEEKLY PLAN</div><h1>任务计划</h1><p>按周查看当前任务、目标日期和待处理事项；负责人、验收标准与周内拆分待补充。</p></div><span class="task-range">${esc(taskPlan.range.start.replaceAll('-', '.'))} — ${esc(taskPlan.range.end.replaceAll('-', '.'))}</span></header><div class="task-summary">${shared}</div><div class="gantt"><div class="gantt-head"><div>任务</div><div class="gantt-scale">${weekLabels}</div></div>${rows}</div><p class="task-note">${esc(taskPlan.note)}　目标日期均为 2026 年。</p></section>`;
}
function projectList(items) {
  return `<ul class="project-list">${items.map(x => `<li>${md(x)}</li>`).join('')}</ul>`;
}
function renderProjectPage(p) {
  const docLinks = p.documents.map(d => `<a class="project-doc" href="${esc(d.href)}"><span>${esc(d.kind)}</span><strong>${esc(d.label)}</strong><i aria-hidden="true">↗</i></a>`).join('');
  const pills = items => items.map(x => `<span>${esc(x)}</span>`).join('');
  const demos = p.id === 'taiwan-site' ? `<section class="project-section project-wide"><h2>站点 Demo</h2><div class="project-demos">${siteDemos.map(d => `<a class="project-demo" href="${esc(d.url)}"><div><strong>${esc(d.name)}</strong><span>${esc(d.status)}</span></div><p>${esc(d.note)}</p><small>${esc(d.url)} ↗</small></a>`).join('')}</div></section>` : '';
  return `<article class="project-page" id="project-${esc(p.id)}" data-project-title="${esc(p.name)}" hidden>
    <div class="page-crumb"><a href="#/tasks">任务计划</a><span>/</span><span>重点项目</span></div>
    <header class="project-header"><div><div class="eyebrow">PROJECT LIBRARY / 重点项目</div><div class="project-title"><h1>${esc(p.name)}</h1>${badge(p.status)}</div><p class="project-summary">${md(p.summary)}</p></div><a class="project-back" href="#/tasks">← 回到任务计划</a></header>
    <div class="project-meta"><div><small>当前阶段</small><strong>${esc(p.phase)}</strong></div><div><small>产品 / 业务</small><div class="project-pills">${pills(p.products)}</div></div><div><small>涉及技术域</small><div class="project-pills">${pills(p.domains)}</div></div></div>
    <div class="project-grid">
      <section class="project-section project-wide"><h2>项目目标</h2><p>${md(p.objective)}</p></section>
      <section class="project-section"><h2>当前内容</h2>${projectList(p.current)}</section>
      <section class="project-section"><h2>项目范围</h2>${projectList(p.scope)}</section>
      <section class="project-section"><h2>关联关系</h2><h3>外部依赖</h3><div class="project-pills">${pills(p.dependencies)}</div><h3>周期产出</h3>${projectList(p.deliverables)}</section>
      <section class="project-section"><h2>已确认决策</h2>${projectList(p.decisions)}</section>
      <section class="project-section project-open"><h2>待确认事项</h2>${projectList(p.open)}</section>
      <section class="project-section project-wide"><h2>验收口径</h2>${projectList(p.acceptance)}</section>
      <section class="project-section project-wide"><h2>项目资料库</h2><div class="project-docs">${docLinks}</div></section>
      ${demos}
    </div>
  </article>`;
}
const taskPlanCSS = `
.task-plan{margin-top:0}.task-plan-heading{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:24px}.task-plan-heading h1{font-size:34px;font-weight:650;letter-spacing:-.8px;margin:0 0 10px}.task-plan-heading p{font-size:14px;color:var(--muted);margin:0}.task-range{font-size:12px;color:var(--muted);white-space:nowrap;border:1px solid var(--line);background:#fff;padding:7px 10px;border-radius:5px}.task-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:20px}.task-card{display:block;background:#fff;border:1px solid var(--line);border-top:3px solid #7890a4;border-radius:7px;padding:12px 13px;min-height:92px;color:var(--ink);text-decoration:none}.task-card:hover{border-color:#7a9bb7;box-shadow:0 3px 10px #1937530c;text-decoration:none}.task-card:nth-child(2){border-top-color:#5e997f}.task-card:nth-child(3){border-top-color:#806b9d}.task-card:nth-child(4){border-top-color:#ba8150}.task-card:nth-child(5){border-top-color:#77818d}.task-card:nth-child(6){border-top-color:#458e93}.task-card>div{display:flex;align-items:baseline;gap:7px;justify-content:space-between}.task-card strong{font-size:13px}.task-card p{font-size:11px;color:#65788a;line-height:1.6;margin:9px 0 4px}.task-card small{font-size:10px;color:#8a96a0}.gantt{border:1px solid var(--line);border-radius:9px;background:#fff;overflow:hidden}.gantt-head,.task-row{display:grid;grid-template-columns:285px minmax(0,1fr)}.gantt-head{background:#f3f6f8;color:#687b8d;font-size:11px;border-bottom:1px solid var(--line)}.gantt-head>div:first-child{padding:12px 16px}.gantt-scale{height:38px;position:relative;border-left:1px solid var(--line)}.gantt-scale span{position:absolute;top:11px;transform:translateX(-50%);font-size:10px;color:#7b8b99}.gantt-scale span:first-child{transform:none}.task-row{min-height:86px;border-bottom:1px solid #e8edf0}.task-row:last-child{border-bottom:0}.task-meta{padding:12px 16px;border-right:1px solid var(--line);min-width:0}.task-meta strong{display:block;font-size:13px;margin-bottom:3px}.task-meta strong a{color:var(--ink);text-decoration:none}.task-meta strong a:hover{text-decoration:underline}.task-meta>span{display:block;color:#66798c;font-size:10px;line-height:1.55}.task-open,.task-request{font-size:10px;line-height:1.5;margin-top:6px;color:#896b3a}.task-request{color:#5b7184}.task-open b,.task-request b{font-weight:600;margin-right:5px}.task-track{position:relative;background-image:repeating-linear-gradient(to right,transparent 0,transparent calc(100% / 13 - 1px),#e8edf0 calc(100% / 13 - 1px),#e8edf0 calc(100% / 13));background-size:100% 100%;min-width:0}.task-bar{position:absolute;top:25px;height:30px;border-radius:5px;min-width:28px;display:flex;align-items:center;padding:0 9px;color:#fff;box-shadow:0 2px 4px #20344716}.task-bar span{font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.task-bar.blue{background:#597fa4}.task-bar.green{background:#5f977d}.task-bar.purple{background:#806a9e}.task-bar.orange{background:#ba7d4d}.task-bar.slate{background:#737f8b}.task-bar.teal{background:#458e93}.task-target-label{position:absolute;top:14px;margin-left:13px;font-size:11px;color:#396b70;white-space:nowrap}.task-target-label small{display:block;font-size:10px;color:var(--muted)}.task-milestone{position:absolute;top:31px;width:11px;height:11px;background:#fff;border:2px solid #6d7f8e;transform:translateX(-50%) rotate(45deg);z-index:2}.task-note{font-size:11px;color:var(--muted);margin:12px 0 0}.task-plan .badge{font-size:9px;padding:1px 5px;white-space:nowrap}
@media(max-width:950px){.task-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.gantt-head,.task-row{grid-template-columns:220px minmax(0,1fr)}.task-plan-heading{display:block}.task-range{display:inline-block;margin-top:12px}}
@media(max-width:650px){.task-summary{grid-template-columns:1fr}.gantt{overflow-x:auto}.gantt-head,.task-row{grid-template-columns:190px 690px;width:880px}.task-plan-heading h1{font-size:28px}.task-note{line-height:1.7}}
@media print{#view-tasks[hidden]{display:block!important;break-before:page}.task-plan-heading,.task-summary,.gantt{break-inside:avoid}.task-summary{grid-template-columns:repeat(3,minmax(0,1fr))}.task-row{break-inside:avoid}}
.project-page{max-width:1120px}.project-header{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding-bottom:28px;margin-bottom:22px;border-bottom:1px solid #d4dee6}.project-title{display:flex;align-items:center;gap:14px;flex-wrap:wrap}.project-title h1{font-size:38px;font-weight:650;line-height:1.4;margin:0;letter-spacing:-.8px}.project-title .badge{font-size:11px}.project-summary{font-size:19px;line-height:1.85;color:#355471;max-width:850px;margin:16px 0 0}.project-back{font-size:12px;color:#587891;white-space:nowrap;margin-top:8px}.project-meta{display:grid;grid-template-columns:180px 1fr 1fr;gap:12px;margin-bottom:18px}.project-meta>div{background:#f5f8fa;border:1px solid #dfe7ed;border-radius:7px;padding:13px 15px;min-width:0}.project-meta small{display:block;color:#8a98a4;font-size:10px;margin-bottom:6px}.project-meta strong{font-size:13px;font-weight:600;color:#304c63}.project-pills{display:flex;flex-wrap:wrap;gap:5px}.project-pills span{font-size:11px;color:#567189;border:1px solid #d6e2ea;background:#fff;border-radius:4px;padding:3px 7px}.project-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.project-section{background:#fff;border:1px solid var(--line);border-radius:8px;padding:20px 22px;min-width:0}.project-section.project-wide{grid-column:1/-1}.project-section h2{font-size:16px;font-weight:600;color:#304e67;margin:0 0 14px}.project-section h3{font-size:11px;color:#7a8d9d;margin:14px 0 8px}.project-section p{font-size:13px;line-height:1.85;color:#566b7e;margin:0}.project-list{list-style:none;padding:0;margin:0}.project-list li{position:relative;padding:8px 0 8px 15px;border-bottom:1px solid #eef1f3;font-size:13px;line-height:1.8;color:#566b7e}.project-list li:last-child{border-bottom:0;padding-bottom:0}.project-list li:first-child{padding-top:0}.project-list li:before{content:'';position:absolute;left:0;top:17px;width:4px;height:4px;border-radius:50%;background:#a8b8c5}.project-list li:first-child:before{top:8px}.project-open{border-left:3px solid #cbb586;background:#fffefa}.project-open h2{color:#7f632f}.project-docs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.project-doc{display:grid;grid-template-columns:72px minmax(0,1fr) 12px;gap:8px;align-items:center;border:1px solid #dfe7ed;background:#f9fbfc;border-radius:6px;padding:10px 11px;color:#4e6d86}.project-doc:hover{border-color:#7a9bb7;background:#f3f8fb;text-decoration:none}.project-doc span{font-size:9px;color:#8b9aa6}.project-doc strong{font-size:11px;font-weight:550;overflow-wrap:anywhere}.project-doc i{font-size:11px;color:#9babb8;font-style:normal}@media(max-width:850px){.project-header{display:block}.project-back{display:inline-block;margin-top:14px}.project-meta{grid-template-columns:1fr 1fr}.project-meta>div:first-child{grid-column:1/-1}.project-section.project-wide{grid-column:auto}.project-grid{grid-template-columns:1fr}}@media(max-width:650px){.project-title h1{font-size:30px}.project-summary{font-size:17px}.project-meta{grid-template-columns:1fr}.project-meta>div:first-child{grid-column:auto}.project-docs{grid-template-columns:1fr}.project-section{padding:17px}.project-page .page-crumb{margin-bottom:20px}}
.project-demos{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.project-demo{display:block;border:1px solid #dfe7ed;background:#f9fbfc;border-radius:6px;padding:12px 13px;color:#4e6d86}.project-demo:hover{border-color:#7a9bb7;background:#f3f8fb;text-decoration:none}.project-demo>div{display:flex;justify-content:space-between;gap:8px;align-items:baseline}.project-demo strong{font-size:12px}.project-demo span{font-size:10px;color:#8b9aa6}.project-demo p{font-size:11px;line-height:1.7;margin:8px 0;color:#667c8e}.project-demo small{font-size:10px;color:#71899a;overflow-wrap:anywhere}@media(max-width:650px){.project-demos{grid-template-columns:1fr}}
.architecture-blueprint{border-top:3px solid #557b9a;background:#fbfdfe}.blueprint-thesis{font-size:14px!important;line-height:1.95!important;color:#405f77!important;margin:0 0 18px!important}.architecture-blueprint h3{font-size:12px;color:#3f6179;margin:23px 0 9px;padding-top:13px;border-top:1px solid #e6edf2}.architecture-blueprint h3:first-of-type{margin-top:0;padding-top:0;border-top:0}.blueprint-rows{border:1px solid #dfe7ed;border-radius:6px;overflow:hidden;background:#fff}.blueprint-row{display:grid;grid-template-columns:190px 1.2fr 1fr;border-bottom:1px solid #e8eef2}.blueprint-row:last-child{border-bottom:0}.blueprint-cell{padding:10px 12px;font-size:12px;line-height:1.8;color:#607588;border-left:1px solid #e8eef2}.blueprint-cell:first-child{border-left:0}.blueprint-cell.lead-cell{font-weight:600;color:#35536a;background:#f5f9fb}.blueprint-bullets{list-style:none;padding:0;margin:0}.blueprint-bullets li{position:relative;padding:8px 0 8px 15px;border-bottom:1px solid #eef1f3;font-size:12px;line-height:1.8;color:#607588}.blueprint-bullets li:last-child{border-bottom:0}.blueprint-bullets li:before{content:'';position:absolute;left:0;top:17px;width:4px;height:4px;border-radius:50%;background:#9cafbd}.blueprint-scenario{margin:0;border:1px solid #dfe7ed;border-radius:6px;background:#fff;overflow:hidden}.blueprint-scenario figcaption{padding:11px 13px;background:#f4f8fa;border-bottom:1px solid #e2e9ee;font-size:12px;font-weight:600;color:#45647a}.blueprint-scenario ol{list-style:none;padding:0;margin:0}.blueprint-scenario li{display:grid;grid-template-columns:28px 1fr;gap:8px;padding:10px 13px;border-bottom:1px solid #eef1f3;font-size:12px;line-height:1.8;color:#607588}.blueprint-scenario li:last-child{border-bottom:0}.blueprint-scenario li>span{font-size:10px;color:#91a3b0;padding-top:3px}@media(max-width:700px){.blueprint-row{display:block}.blueprint-cell{border-left:0;border-top:1px solid #e8eef2}.blueprint-cell:first-child{border-top:0}.blueprint-cell.lead-cell{border-top:0}.architecture-blueprint{padding:17px}.blueprint-scenario li{grid-template-columns:24px 1fr}}
`;
function chain(name) {
  const items = L.chains[name];
  if (!items) return '';
  if (!Array.isArray(items)) {
    const flow = items.flow ? `<ol class="tax-process">${items.flow.map((step, i) => `<li><span class="tax-step-no">${String(i + 1).padStart(2, '0')}</span><div><strong>${esc(step.title)}</strong><small>${esc(step.actor)}</small></div><p>${esc(step.action)}</p></li>`).join('')}</ol>` : '';
    const lanes = items.lanes.map(lane => `<section class="chain-lane"><h4>${esc(lane.label)}</h4><ol style="--steps:${lane.steps.length}">${lane.steps.map((x, i) => `<li><span>${String(i + 1).padStart(2, '0')}</span><strong>${esc(x)}</strong></li>`).join('')}</ol></section>`).join('');
    const exceptions = items.exceptions ? `<section class="tax-exceptions"><h4>异常处理</h4><dl>${items.exceptions.map(item => `<div><dt>${esc(item.title)}</dt><dd>${esc(item.action)}</dd></div>`).join('')}</dl></section>` : '';
    return `<figure class="chain"><figcaption>${esc(items.caption)}</figcaption>${flow}${lanes}${exceptions}<p class="chain-note">${esc(items.note)}</p></figure>`;
  }
  const caption = name === '资金与结算' ? '资金通则 · API 成交由渠道收款后结算给我们；H5 成交直接到我们账。留学缴费不经过平台账户。' : '已确认的业务链路';
  return `<figure class="chain"><figcaption>${esc(caption)}</figcaption><ol>${items.map((x, i) => `<li><span>${String(i + 1).padStart(2, '0')}</span><strong>${esc(x)}</strong></li>`).join('')}</ol></figure>`;
}
function list(arr, empty) {
  return arr.length ? `<ul class="prose-list">${arr.map(x => `<li>${md(x)}</li>`).join('')}</ul>` : `<p class="empty">${empty}</p>`;
}
function blueprintSection(b) {
  if (!b.blueprint) return '';
  const x = b.blueprint;
  const rows = arr => `<div class="blueprint-rows">${arr.map(row => `<div class="blueprint-row">${row.map((cell, i) => `<div class="blueprint-cell ${i === 0 ? 'lead-cell' : ''}">${md(cell)}</div>`).join('')}</div>`).join('')}</div>`;
  const bullets = arr => `<ul class="blueprint-bullets">${arr.map(item => `<li>${md(item)}</li>`).join('')}</ul>`;
  return `<p class="blueprint-thesis">${md(x.thesis)}</p><h3>逻辑子能力</h3>${rows(x.functions)}<h3>核心对象与数据边界</h3>${rows(x.model)}<h3>主要调用契约</h3>${rows(x.contracts)}<h3>状态流转</h3>${bullets(x.state)}<h3>典型协作场景</h3><figure class="blueprint-scenario"><figcaption>${esc(x.scenario.title)}</figcaption><ol>${x.scenario.steps.map((s, i) => `<li><span>${String(i + 1).padStart(2, '0')}</span>${md(s)}</li>`).join('')}</ol></figure><h3>事件与异步协作</h3>${bullets(x.eventsDetail)}<h3>失败、补偿与边界</h3>${bullets(x.failure)}<h3>验收口径</h3>${bullets(x.acceptance)}<h3>仍需决策</h3>${bullets(x.decisions)}`;
}
function renderPage(n) {
  const b = n.rich;
  const depLabels = { supply: '供给与合作', hub: '平台职能', distribution: '触达与分发', systems: '相关系统', stations: '所属站点', related: '相关说明' };
  const deps = Object.entries(b.deps).filter(([key, a]) => key !== 'links' && a.length);
  const jumps = b.deps.links?.length ? `<div class="jump-relation"><span>链接跳转关系</span><div>${b.deps.links.map(ref).join('')}</div><p>仅通过链接跳转，不涉及产品间的依赖或耦合。</p></div>` : '';
  const sections = [
    ['current', '当前事实', list(b.current, ''), ''],
    ...(b.blueprint ? [['blueprint', '架构蓝图（建议规划）', blueprintSection(b), 'architecture-blueprint']] : []),
    ['deps', '关联关系', (deps.length ? deps.map(([key, values]) => `<div class="dep-row"><span>${esc(depLabels[key] ?? key)}</span><div>${values.map(ref).join('')}</div></div>`).join('') : '') + jumps + chain(n.name) || '<p class="empty">暂无已确认的关联补充。</p>', ''],
    ['next', '下一步', list(b.next, '尚无已确认的新增安排。'), ''],
    ['judgment', '判断', list(b.judgment, '本页仅陈述已确认事实，暂不补充判断。'), 'quiet-section'],
    ['open', '待确认', list(b.open, '暂无待确认事项。'), 'open-section'],
    ['source', '事实来源', `<p class="source-text">${esc(b.source)}</p>`, 'source-section'],
  ];
  return `<article class="bpage" id="page-${esc(n.id)}" data-title="${esc(n.name)}" hidden>
    <div class="page-crumb"><a href="#/ov">业务全景</a><span>/</span><span>${esc(n.kind)}</span><a href="#/arch" style="margin-left:auto">系统架构 ↗</a></div>
    <header class="page-header"><div class="eyebrow">BILIONPASS / ${esc(n.kind)}</div><div class="page-title"><h1>${esc(n.name)}</h1>${badge(b.badge)}</div><p class="lead" data-section="conclusion">${md(b.oneliner)}</p>${b.audience ? `<p class="audience">${esc(b.audience)}</p>` : ''}</header>
    <div class="article-layout"><div class="article-body">${sections.map(([id, title, body, cls], i) => `<section class="doc-section ${cls}" id="${esc(n.id)}-${id}" data-section="${id}"><div class="section-heading"><span>${String(i + 1).padStart(2, '0')}</span><h2>${title}</h2></div>${body}</section>`).join('')}</div><nav class="page-toc" aria-label="本页目录"><span>本页内容</span>${sections.map(([id, title]) => `<a href="${href(n.id)}?section=${id}">${title}</a>`).join('')}<a class="back-top" href="#/ov">← 回到业务全景</a></nav></div>
  </article>`;
}
const architectureView = renderArchitecture(architecture, { esc, badge, pageHref: name => {
  const id = idOf.get(refAliases[canonical(name)] ?? canonical(name));
  assert(id, `系统架构说明链接「${name}」没有对应页面`);
  return href(id);
} });
const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(meta.title)} · 业务全景</title>
<style>
:root{--ink:#1e2b3c;--muted:#67768a;--faint:#8993a0;--line:#e0e5e9;--paper:#fff;--canvas:#f6f7f8;--accent:#214d70;--soft:#edf3f7;--green:#29705c;--amber:#8b672c;--nav:248px}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:30px}body{margin:0;background:var(--canvas);color:var(--ink);font:15px/1.85 -apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}button,input{font:inherit}button{cursor:pointer}a:focus-visible,button:focus-visible,input:focus-visible{outline:2px solid #336fa0;outline-offset:4px}[hidden]{display:none!important}
.sidebar{position:fixed;inset:0 auto 0 0;width:var(--nav);background:var(--paper);border-right:1px solid var(--line);display:flex;flex-direction:column;z-index:10}.brand{padding:26px 22px 20px}.brand strong{font-size:22px;letter-spacing:-.7px;display:block}.brand small{font-size:12px;color:var(--muted);letter-spacing:2px}.search-box{margin:0 16px 14px}.search-box input{width:100%;font-size:12px;border:1px solid var(--line);border-radius:7px;padding:8px 10px;background:var(--canvas)}.nav-scroll{overflow-y:auto;padding:0 12px 30px;flex:1}.nav-heading{font-size:11px;color:var(--muted);letter-spacing:1.2px;padding:22px 10px 6px;display:flex;justify-content:space-between}.nav-heading span{color:var(--faint);font-variant-numeric:tabular-nums}.nav-scroll a{display:block;padding:6px 10px;font-size:13px;color:#49586b;border-radius:5px;line-height:1.6;margin:2px 0}.nav-scroll a:hover{background:#f2f5f7;text-decoration:none}.nav-scroll a[aria-current=page]{background:#eaf1f6;color:#214d70;font-weight:600}.sidebar-footer{padding:12px 22px;border-top:1px solid var(--line);font-size:11px;color:var(--faint)}main{margin-left:var(--nav);max-width:1700px;padding:34px 48px 70px}.topline{display:flex;justify-content:space-between;align-items:center;font-size:11px;letter-spacing:1.3px;color:var(--muted);border-bottom:1px solid var(--line);padding-bottom:15px;margin-bottom:34px}.topline span:last-child{letter-spacing:.2px}.mobile-bar{display:none}.eyebrow{font-size:11px;letter-spacing:1.6px;color:var(--muted);margin-bottom:12px}.overview-title{font-size:38px;letter-spacing:-1px;font-weight:650;margin:0 0 14px;line-height:1.35}.intro{max-width:800px;font-size:18px;line-height:1.85;color:#3b4f64;margin:0 0 8px}.intro-secondary{font-size:13px;color:var(--muted);margin:0}.overview-head{margin-bottom:30px}.landscape{display:grid;gap:12px}.land-band{display:grid;grid-template-columns:108px 1fr;gap:20px;padding:21px 22px;background:#fff;border:1px solid var(--line);border-radius:10px}.band-label span{color:var(--faint);font-size:11px;letter-spacing:1px}.band-label h3{font-size:13px;font-weight:550;margin:5px 0;line-height:1.65}.land-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.land-grid.systems{grid-template-columns:repeat(4,minmax(0,1fr))}.land-node{min-width:0;display:flex;flex-direction:column;justify-content:space-between;border:1px solid #dce4ea;border-radius:7px;padding:13px 14px 11px;gap:14px;background:#fcfdfe;transition:box-shadow .15s,border-color .15s;color:var(--ink)}.land-node:hover{border-color:#7a9bb7;box-shadow:0 3px 10px #1937530c;text-decoration:none}.land-node strong{font-size:13px;font-weight:600;line-height:1.6;overflow-wrap:anywhere}.gold .land-node{background:#fffefa;border-color:#e8dfc9}.green .land-node{background:#fcfefc;border-color:#d6e6dc}.node-bottom{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.node-arrow{color:#a0abb6;font-size:13px;margin-left:auto}.badge{display:inline-flex;align-items:center;gap:5px;font-size:10px;line-height:1.65;font-weight:500;border-radius:4px;padding:2px 6px;color:#68717d;background:#f0f2f4}.badge i{width:5px;height:5px;border-radius:50%;background:currentColor;flex-shrink:0}.badge.run{color:#276752;background:#eaf3ee}.badge.partial{color:#916817;background:#faf3e3}.badge.dev{color:#2b6099;background:#ebf2fa}.tag{font-size:10px;color:#697586;border:1px solid #dce3e9;padding:0 5px;border-radius:4px}.legend{font-size:11px;color:var(--muted);display:flex;gap:12px;flex-wrap:wrap;margin-top:15px}.overview-section{margin-top:54px;scroll-margin-top:24px}.business-flow-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.business-flow{border:1px solid #dce5eb;border-top:3px solid #6d8ba3;border-radius:8px;background:#fff;padding:15px 16px}.business-flow.green{border-top-color:#5c977b}.business-flow.purple{border-top-color:#806a9e}.business-flow.amber{border-top-color:#b18b50}.business-flow header{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.business-flow header h3{font-size:14px;color:#304f68;margin:0}.business-flow header span{display:block;font-size:10px;color:#8a9aa6;margin-top:4px}.business-flow header b{font-size:13px;color:#a1afba;font-weight:400}.business-flow ol{list-style:none;padding:0;margin:15px 0 12px;display:flex;flex-wrap:wrap;gap:5px}.business-flow li{display:flex;align-items:baseline;gap:5px;position:relative;background:#f2f6f8;border-radius:4px;padding:4px 7px;font-size:10px;color:#607588}.business-flow li:not(:last-child):after{content:'→';position:absolute;right:-7px;color:#97aab8}.business-flow li span{font-size:8px;color:#9aabb7}.business-flow li strong{font-weight:500;white-space:nowrap}.business-flow p{font-size:11px;line-height:1.7;color:#81909b;margin:0}.overview-section>h2{font-size:23px;font-weight:600;margin:0 0 8px;letter-spacing:-.5px}.overview-section>p{font-size:14px;color:var(--muted);margin:0 0 20px}.cap-grid{display:grid;grid-template-columns:1fr 1.5fr;gap:16px}.cap-card{background:#fff;border:1px solid var(--line);border-radius:9px;padding:22px}.cap-card h3{font-size:14px;font-weight:600;margin:0 0 15px}.cap-card h3 span{font-size:26px;margin-right:9px;font-weight:500;color:var(--accent)}.cap-items{display:flex;gap:8px;flex-wrap:wrap}.cap-items span{background:#f3f6f8;border:1px solid #e3e9ed;padding:3px 11px;font-size:12px;border-radius:5px}.cap-card:first-child .cap-items span{color:#276752;background:#edf5f1;border-color:#dceae2}.diag-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.diag-card{padding:23px;background:#fff;border:1px solid var(--line);border-radius:9px}.diag-number{font-size:12px;color:var(--faint)}.diag-card h3{font-size:22px;font-weight:500;margin:10px 0}.diag-card .now{color:var(--amber);font-size:12px;margin:0 0 14px}.diag-card p{font-size:13px;color:#647185;margin:0}.diag-card a{display:inline-block;margin-top:20px;font-size:12px}.fact-table{background:#fff;border:1px solid var(--line);border-radius:8px;overflow:hidden}.fact-row{display:grid;grid-template-columns:170px 1fr;padding:15px 22px;gap:24px;font-size:13px;border-bottom:1px solid #e9edef}.fact-row:last-child{border:0}.fact-row dt{font-weight:600}.fact-row dd{margin:0;color:#5b6879}.facts-note{font-size:11px;color:var(--muted);margin-top:16px}.page-crumb{display:flex;gap:11px;color:var(--faint);font-size:12px;margin-bottom:28px}.page-header{padding:0 0 28px;margin-bottom:30px;border-bottom:1px solid #d4dee6}.page-title{display:flex;align-items:center;gap:16px;flex-wrap:wrap}.page-title h1{font-size:38px;font-weight:650;line-height:1.4;margin:0;letter-spacing:-.8px}.page-title .badge{font-size:11px}.lead{font-size:21px;font-weight:400;color:#355471;line-height:1.85;max-width:900px;margin:18px 0 0}.audience{font-size:12px;color:var(--muted);margin:12px 0 0}.article-layout{display:grid;grid-template-columns:minmax(0,1fr) 128px;gap:36px}.article-body{min-width:0;max-width:1000px}.doc-section{margin:0 0 22px;padding:25px 28px;background:#fff;border:1px solid var(--line);border-radius:9px;scroll-margin-top:24px}.section-heading{display:flex;align-items:baseline;gap:11px;margin-bottom:15px}.section-heading>span{font-size:11px;letter-spacing:1px;color:#9aa6b1}.section-heading h2{font-size:16px;font-weight:600;margin:0}.prose-list{margin:0;padding:0;list-style:none}.prose-list li{position:relative;padding:11px 0 11px 17px;line-height:1.9;font-size:14px;border-bottom:1px solid #eef1f3}.prose-list li:last-child{border-bottom:0;padding-bottom:0}.prose-list li:first-child{padding-top:0}.prose-list li:before{content:'';position:absolute;left:0;top:23px;width:4px;height:4px;border-radius:50%;background:#a8b8c5}.prose-list li:first-child:before{top:12px}.prose-list strong{font-weight:600;color:#1d374e}.empty{font-size:13px;color:var(--muted);margin:0}.quiet-section{background:#fbfcfd}.open-section{border-left:3px solid #cbb586;background:#fffefa}.open-section .section-heading h2{color:#7f632f}.source-section{background:none;border:0;padding:8px 2px}.source-text{font-size:12px;color:var(--muted);line-height:1.9;margin:0;overflow-wrap:anywhere}.page-toc{position:sticky;top:30px;align-self:start;border-left:1px solid var(--line);padding:0 0 0 18px}.page-toc>span{font-size:11px;color:var(--faint);letter-spacing:1px}.page-toc a{display:block;font-size:12px;color:var(--muted);margin-top:11px}.page-toc .back-top{margin-top:24px;font-size:11px;color:var(--accent)}.dep-row{display:grid;grid-template-columns:86px 1fr;gap:12px;margin:12px 0;align-items:start}.dep-row>span{font-size:11px;color:var(--faint);padding-top:5px}.dep-row>div{display:flex;flex-wrap:wrap;gap:7px}.ref{display:inline-flex;align-items:center;gap:13px;font-size:12px;border:1px solid #dee6ec;background:#f8fafc;border-radius:5px;padding:3px 9px}.ref span{color:#8b9eb0}.chain{margin:22px 0 0;padding:20px 0 0;border-top:1px solid var(--line)}.chain figcaption{font-size:11px;color:var(--muted);margin-bottom:14px}.chain ol{list-style:none;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;padding:0;margin:0}.chain li{position:relative;background:#edf3f7;padding:10px;border-radius:6px}.chain li+li:before{content:'→';position:absolute;left:-14px;top:38%;font-size:11px;color:#8b9eb0}.chain li span{font-size:10px;display:block;color:#8b9eb0;letter-spacing:1px}.chain li strong{display:block;font-size:11px;font-weight:500;line-height:1.8;overflow-wrap:anywhere}.doc-footer{font-size:11px;color:var(--faint);border-top:1px solid var(--line);padding-top:20px;margin-top:48px}.no-results{font-size:12px;padding:15px 10px;color:var(--muted)}code{font-family:ui-monospace,monospace;font-size:.9em;background:#f1f4f6;padding:2px 5px;border-radius:4px}
@media(min-width:1600px){main{padding-left:64px;padding-right:64px}}
@media(max-width:1250px){main{padding:28px}.land-grid.systems{grid-template-columns:repeat(3,minmax(0,1fr))}.article-layout{grid-template-columns:minmax(0,1fr)}.page-toc{display:none}.land-band{grid-template-columns:85px 1fr;padding:18px;gap:12px}.land-node{padding:11px}}
@media(max-width:900px){.business-flow-grid{grid-template-columns:1fr}}
@media(max-width:1000px){:root{--nav:218px}main{padding:24px}.land-band{display:block}.band-label{display:flex;align-items:baseline;gap:8px;margin-bottom:12px}.band-label h3{margin:0}.land-grid,.land-grid.systems{grid-template-columns:repeat(2,minmax(0,1fr))}.overview-title,.page-title h1{font-size:30px}.diag-grid{grid-template-columns:1fr}.diag-card{padding:20px}.cap-grid{grid-template-columns:1fr}.doc-section{padding:22px}.lead{font-size:19px}.chain ol{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:720px){.sidebar{visibility:hidden;width:270px;transform:translateX(-100%);transition:transform .2s}.sidebar.open{visibility:visible;transform:translateX(0);box-shadow:15px 0 40px #142b3d18}main{margin:0;padding:20px 18px 50px}.mobile-bar{display:flex;position:sticky;top:0;z-index:11;background:#fffffff5;border-bottom:1px solid var(--line);padding:10px 18px;align-items:center;justify-content:space-between;font-size:13px}.mobile-bar button{border:1px solid var(--line);background:#fff;padding:2px 10px;border-radius:5px;font-size:12px}.sidebar .brand{padding-top:66px}.topline{margin-bottom:24px}.topline span:first-child{display:none}.overview-title,.page-title h1{font-size:28px}.intro{font-size:16px}.land-band{padding:15px}.land-grid,.land-grid.systems{gap:8px}.land-node{padding:10px;gap:12px}.land-node strong{font-size:12px}.node-bottom{gap:4px}.node-arrow{display:none}.badge,.tag{font-size:9px}.doc-section{padding:20px}.lead{font-size:18px}.dep-row{display:block}.dep-row>span{display:block;margin-bottom:7px}.fact-row{grid-template-columns:1fr;gap:5px;padding:14px 18px}.overview-section{margin-top:38px}.page-header{padding-bottom:24px}.prose-list li{font-size:13px}.page-crumb{margin-bottom:24px}.chain ol{gap:12px}.chain li+li:before{left:-11px}.doc-footer{margin-top:30px}}
@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}
@media print{.sidebar,.mobile-bar,.topline,.page-toc,.page-crumb,.doc-footer{display:none!important}main{margin:0;padding:0;max-width:none}body{background:#fff;font-size:11px}#view-overview,#view-block,.bpage[hidden]{display:block!important}.bpage{break-before:page}.overview-title,.page-title h1{font-size:26px}.land-band,.doc-section,.cap-card,.diag-card{break-inside:avoid}.page-header{margin-top:20px}.article-layout{display:block}.lead{font-size:16px}.prose-list li{font-size:12px}.land-grid,.land-grid.systems{grid-template-columns:repeat(3,minmax(0,1fr))}a{color:inherit;text-decoration:none}.doc-section{padding:16px;margin-bottom:12px}}
${architectureCSS}
${taskPlanCSS}
.access-table{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:14px 0}.access-table div{background:#fff;border:1px solid var(--line);border-radius:8px;padding:14px 16px}.access-table b{display:block;font-size:13px;margin-bottom:6px}.access-table span{display:block;font-size:12px;line-height:1.75;color:var(--muted)}@media(max-width:900px){.access-table{grid-template-columns:1fr}}
.chain-lane{margin:16px 0}.chain-lane h4{font-size:12px;color:#45667f;margin:0 0 10px;font-weight:600}.chain-lane ol{grid-template-columns:repeat(var(--steps),minmax(0,1fr))}.chain-note{font-size:11px;color:var(--muted);line-height:1.8;margin:14px 0 0}
.chain ol.tax-process{display:block;border:1px solid var(--line);border-radius:7px;overflow:hidden}.chain .tax-process li{display:grid;grid-template-columns:24px 145px minmax(0,1fr);gap:12px;background:#fff;border-radius:0;padding:15px 13px;border-bottom:1px solid var(--line);align-items:start;break-inside:avoid}.chain .tax-process li:last-child{border-bottom:0}.chain .tax-process li:before{content:none}.chain .tax-process strong{font-size:12px}.tax-process small{display:block;font-size:10px;color:var(--muted);line-height:1.7;margin-top:4px}.tax-process p{margin:0;font-size:12px;line-height:1.9;color:#536578}.tax-step-no{padding-top:3px}.tax-exceptions{margin-top:22px}.tax-exceptions h4{font-size:12px;font-weight:600;color:#45667f}.tax-exceptions dl{margin:0}.tax-exceptions dl>div{display:grid;grid-template-columns:175px 1fr;gap:12px;padding:9px 0;border-bottom:1px solid var(--line);font-size:12px}.tax-exceptions dt{font-weight:550}.tax-exceptions dd{margin:0;color:var(--muted)}
@media(max-width:650px){.chain-lane ol{grid-template-columns:1fr;gap:17px}.chain-lane li+li:before{content:'↓';top:-19px;left:50%}}
@media(max-width:650px){.chain .tax-process li{grid-template-columns:24px minmax(0,1fr);gap:7px}.tax-process p{grid-column:2}.tax-exceptions dl>div{grid-template-columns:1fr;gap:4px}}
</style></head><body>
<div class="mobile-bar"><strong>BilionPass / 业务全景</strong><button id="menu-toggle" aria-controls="sidebar" aria-expanded="false">目录</button></div>
<aside class="sidebar" id="sidebar"><a class="brand" href="#/ov"><strong>BilionPass<span style="color:#b7c3cc">.</span></strong><small>业务 · 系统 · 规划</small></a><div class="search-box"><input type="search" id="nav-search" aria-label="查找说明页" placeholder="查找说明页…"></div><nav class="nav-scroll" aria-label="文档目录">${nav()}<p class="no-results" hidden>没有匹配的说明页</p></nav><div class="sidebar-footer">${nodes.length} 篇说明 · ${projects.length} 个重点项目 · 更新 ${esc(meta.updated)}</div></aside>
<main><div class="topline"><span>BILIONPASS / BUSINESS LANDSCAPE</span><span>规划文档 · ${esc(meta.updated)}</span></div>
<div id="view-overview"><div id="ov" class="overview-head"><div class="eyebrow">01 / 整体业务与产品全景</div><h1 class="overview-title">把本地服务，做成渠道方案并提供给旅客。</h1><p class="intro">对 B 端渠道，提供可接入的本地服务解决方案。<br>对旅客，通过不同产品获得对应的本地服务。</p><p class="intro-secondary">七章按产品、渠道、后台和建设路线分开。点击名称进入说明。</p><div class="landscape">${landscape([bands[0], ...platformBands.filter(g => g.title === '分发出口' || g.title === '合作供给方')])}</div></div>
<section id="sites" class="overview-section"><h2>02 BilionPass 站点规划</h2><p>日本站、台湾站、大陆站分别展示。站点之间是独立业务形态，不按一套配置复用。</p><div class="landscape">${landscape(platformBands.filter(g => g.title === 'BilionPass 站点'))}</div></section>
<section id="products" class="overview-section"><h2>03 各产品与服务架构</h2><p>行前购与 BilionPass 并行。行前购按羽田、成田、关西分别记录。</p><h3 class="scope-heading"><a data-block="${esc(idOf.get('BilionPass'))}" href="${href(idOf.get('BilionPass'))}">BilionPass</a></h3><div class="landscape">${landscape(platformBands.filter(g => g.title === '产品与服务内容' || g.title === 'BilionPass 系统'))}</div><h3 class="scope-heading"><a data-block="${esc(idOf.get('行前购'))}" href="${href(idOf.get('行前购'))}">行前购</a></h3><div class="landscape">${landscape(shoppingBands)}</div></section>
<section id="open-platform" class="overview-section"><h2>04 ToB 渠道及开放平台</h2><p>开放平台是建议规划，不是已建设模块。已发生的接入按成交和资金分开，不按页面轻重合并。</p><div class="access-table"><div><b>链接跳转</b><span>合作方成交，资金不经过我方。现有事实：留学缴费跳转 fintech。</span></div><div><b>H5 嵌入</b><span>我方页面成交，资金到我方。现有事实：东航空手行 H5。</span></div><div><b>API 对接</b><span>渠道侧成交，渠道收款后按周期结算。现有事实：携程空手行 API。</span></div></div><p>目录、授权、差异化定价、佣金和结算是开放平台的规划能力。渠道关系按渠道 × 内容 × 形态记录。商户平台是日本本地商户的能力出口，不并入开放平台。</p></section>
<section id="merchant-ops" class="overview-section"><h2>05 商户与运营管理架构</h2><p>按已有系统记录后台。没有确认的功能不写成已有能力。</p><div class="landscape">${landscape(platformBands.filter(g => g.title === '商户与管理端'))}</div></section>
<section id="cap" class="overview-section"><h2>产品关系与共用能力</h2><p>重复的建设状态收在这里，不单列能力现状。会员、交易、商品运行中；资金处于规划阶段。九个业务域是建议规划，不代表已经共用同一套实现。</p><div class="cap-grid"><div class="cap-card"><h3><span>${L.capabilities.running.length}</span>运行中</h3><div class="cap-items">${L.capabilities.running.map(x => `<span>${esc(x)}</span>`).join('')}</div></div><div class="cap-card"><h3><span>${L.capabilities.planning.length}</span>规划阶段</h3><div class="cap-items">${L.capabilities.planning.map(x => `<span>${esc(x)}</span>`).join('')}</div></div></div></section>
<section id="business-map" class="overview-section"><h2>已确认的业务关系</h2><p>只保留影响运行的链路：已运行闭环、接入中的交易链、独立退税资金链。</p><div class="business-flow-grid">${L.businessFlows.map(flow => `<article class="business-flow ${esc(flow.tone)}"><header><div><h3>${esc(flow.title)}</h3><span>${esc(flow.state)}</span></div><b>↗</b></header><ol>${flow.steps.map((step, i) => `<li><span>${String(i + 1).padStart(2, '0')}</span><strong>${esc(step)}</strong></li>`).join('')}</ol><p>${esc(flow.note)}</p></article>`).join('')}</div></section>
<section id="facts" class="overview-section"><h2>可核对规则</h2><dl class="fact-table">${facts.map(([k, v]) => `<div class="fact-row"><dt>${esc(k)}</dt><dd>${md(v)}</dd></div>`).join('')}</dl></section>
<div class="legend">${['在跑', '对接中', '开发中', '规划中', '已上线'].map(badge).join('')}<span>分发出口与合作供给见对应说明页。排期只在建设路线表达。</span></div></div>
<div id="view-tasks" hidden>${renderTaskPlan()}</div>
<div id="view-project" hidden>${projects.map(renderProjectPage).join('\n')}</div>
<div id="view-architecture" hidden>${architectureView}</div>
<div id="view-block" hidden>${nodes.map(renderPage).join('\n')}</div><footer class="doc-footer">业务与系统架构说明　/　事实、规划与待确认事项分别呈现</footer></main>
<script>
(function(){
  var sidebar=document.getElementById('sidebar'), toggle=document.getElementById('menu-toggle');
  var knownSections=['current','blueprint','deps','next','judgment','open','source'];
  function closeMenu(){sidebar.classList.remove('open');toggle.setAttribute('aria-expanded','false');}
  toggle.addEventListener('click',function(){var opened=sidebar.classList.toggle('open');toggle.setAttribute('aria-expanded',String(opened));});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeMenu();});
  document.querySelectorAll('.sidebar a').forEach(function(a){a.addEventListener('click',closeMenu);});
  document.getElementById('arch-expand').addEventListener('click',function(){var on=document.body.classList.toggle('arch-wide');this.setAttribute('aria-pressed',String(on));this.textContent=on?'收起画布':'展开画布';});
  document.getElementById('nav-search').addEventListener('input',function(e){
    var q=e.target.value.trim().toLowerCase(), count=0;
    document.querySelectorAll('.nav-scroll a').forEach(function(a){a.hidden=!a.textContent.toLowerCase().includes(q);if(!a.hidden)count++;});
    document.querySelectorAll('.nav-group').forEach(function(g){g.hidden=!Array.from(g.querySelectorAll('a')).some(function(a){return !a.hidden;});});
    document.querySelector('.no-results').hidden=count>0;
  });
  ${domainPlanScript}
  function route(){
    var hash;try{hash=decodeURIComponent(location.hash||'#/ov');}catch(e){hash='#/ov';}
    var qi=hash.indexOf('?'),base=qi<0?hash:hash.slice(0,qi),params=new URLSearchParams(qi<0?'':hash.slice(qi+1)),section=params.get('section'),domain=params.get('domain'),match=base.match(/^#\\/b\\/(.+)$/),projectMatch=base.match(/^#\\/project\\/(.+)$/);
    var page=match&&document.getElementById('page-'+match[1]), project=projectMatch&&document.getElementById('project-'+projectMatch[1]);
    var overview=document.getElementById('view-overview'), block=document.getElementById('view-block'), arch=document.getElementById('view-architecture'), tasks=document.getElementById('view-tasks'), projectView=document.getElementById('view-project');
    var isArch=base==='#/arch'||base==='#/compliance';
    var isTasks=base==='#/tasks'||base==='#/roadmap';
    document.querySelectorAll('.bpage').forEach(function(p){p.hidden=p!==page;});
    document.querySelectorAll('.project-page').forEach(function(p){p.hidden=p!==project;});
    overview.hidden=!!page||!!project||isArch||isTasks;block.hidden=!page;arch.hidden=!isArch;tasks.hidden=!isTasks;projectView.hidden=!project;
    if(!isArch){document.body.classList.remove('arch-wide');var expand=document.getElementById('arch-expand');expand.setAttribute('aria-pressed','false');expand.textContent='展开画布';}
    var chapterIds=['#/ov','#/sites','#/products','#/open-platform','#/merchant-ops','#/compliance','#/roadmap','#/tasks','#/arch','#/cap','#/facts'];
    var active=page||project?base:chapterIds.includes(base)?base:'#/ov';
    document.querySelectorAll('.nav-scroll a').forEach(function(a){if(decodeURIComponent(a.getAttribute('href'))===active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    var chapterTitle={'#/ov':'整体业务与产品全景','#/sites':'BilionPass 站点规划','#/products':'各产品与服务架构','#/open-platform':'ToB 渠道及开放平台','#/merchant-ops':'商户与运营管理架构','#/compliance':'技术、数据、安全与合规','#/roadmap':'分阶段建设路线','#/arch':'系统架构','#/tasks':'任务计划'};
    document.title=(page?page.getAttribute('data-title'):project?project.getAttribute('data-project-title'):chapterTitle[base]||'业务全景')+' · BilionPass';
    if(page){var target=knownSections.includes(section)&&document.getElementById(match[1]+'-'+section);if(target)target.scrollIntoView();else window.scrollTo(0,0);}
    else if(project){window.scrollTo(0,0);}
    else if(isArch){selectDomain(domain,true);if(!domain){var spot=document.getElementById(section==='domains'?'domain-map':'arch');if(spot)spot.scrollIntoView();}}
    else{var anchor={'#/ov':'ov','#/sites':'sites','#/products':'products','#/open-platform':'open-platform','#/merchant-ops':'merchant-ops','#/cap':'cap','#/facts':'facts','#/arch':'arch','#/tasks':'tasks','#/roadmap':'tasks','#/compliance':'compliance'}[base]||active.slice(2);var el=document.getElementById(anchor);if(el)el.scrollIntoView();}
  }
  document.addEventListener('click',function(e){var a=e.target.closest('a[href^="#/"]');if(a&&a.hash===location.hash){e.preventDefault();route();}});
  window.addEventListener('hashchange',route);route();
})();
</script></body></html>`;

// 成品检查通过才写文件，避免把上一次可用文档覆盖为残缺页面。
assert(!/【待补】/.test(html), '成品仍有待补占位');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
unique(ids, 'DOM ID');
const routes = new Set(nodes.map(n => href(n.id)));
for (const m of html.matchAll(/href="(#\/b\/[^"?]+)(?:\?section=[^"]+)?"/g)) assert(routes.has(m[1]), `悬空路由 ${m[1]}`);
const diagramLinks = [...new Set([...html.matchAll(/data-block="([^"]+)"/g)].map(m => m[1]))];
const diagramNodes = nodes.filter(n => n.diagram).map(n => n.id);
assert(diagramLinks.length === diagramNodes.length, `全景框数量不符：${diagramLinks.length}/${diagramNodes.length}`);
for (const id of diagramNodes) assert(diagramLinks.includes(id), `全景缺少「${id}」`);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`✓ ${path.relative(ROOT, OUT)} · ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`);
console.log(`✓ ${diagramLinks.length} 个全景框 · ${nodes.length} 篇完整说明 · ${Object.keys(L.chains).length} 张链路图 · 无待补占位`);
console.log('✓ 名称、依赖链接、页面 ID、全景框与路由完整性检查通过');

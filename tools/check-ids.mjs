#!/usr/bin/env node
// 零依赖 ID 与关系一致性校验。
// 唯一事实来源: docs/v2/00-总览.md 里的 ID 注册表。
// 校验:
//   A2 注册表数量与无重复
//   A3 注册 ID 都出现在 L0 总图（忽略 %% 注释，避免注释假满足）
//   A4 docs/v2/** 内无幽灵 ID
//   A5 图 1 含全部 EN/AP/BZ；图 2 含全部 BZ/SC/BA
//   A6 矩阵行列 ID 集合 = 注册表该层集合；取值合法；行宽一致
//   A7 M2 与图 2/L0 的 BZ→SC 实线（含带标签边）集合完全一致
// 用法: node tools/check-ids.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const V2 = path.join(ROOT, 'docs/v2');
const OVERVIEW = path.join(V2, '00-总览.md');
const MATRICES = path.join(V2, '03-关系矩阵.md');
const VIEW1 = path.join(V2, '01-业务视图.md');
const VIEW2 = path.join(V2, '02-能力视图.md');

const ID_RE = /\b(EN|AP|BZ|SC|BA)(-AI)?-\d{2}\b/g;
const EXPECTED = { EN: 14, AP: 8, BZ: 11, SC: 9, BA: 11 };
const CELLS = new Set(['●', '○', '?', '·']);
const COVERAGE = [
  [OVERVIEW, ['EN', 'AP', 'BZ', 'SC', 'BA'], 'L0 总图'],
  [VIEW1, ['EN', 'AP', 'BZ'], '图 1 业务视图'],
  [VIEW2, ['BZ', 'SC', 'BA'], '图 2 能力视图'],
];

let failed = false;
const fail = (msg) => { console.error(`✗ ${msg}`); failed = true; };
const ok = (msg) => console.log(`✓ ${msg}`);
const prefixOf = (id) => id.match(/^(EN|AP|BZ|SC|BA)/)[1];

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}
const mermaidOf = (text) =>
  [...text.matchAll(/```mermaid\n([\s\S]*?)\n```/g)].map((m) => m[1]).join('\n');
// 注释不算"声明"：`%% BZ-11 ...` 不能让 A3 通过（第二轮评审 N7）
const stripComments = (mm) =>
  mm.split('\n').filter((l) => !l.trim().startsWith('%%')).join('\n');

// 只取小节里的**第一张**表：小节内可能还有说明用的第二张表（如 M3 的"逐格依据"）
const firstTable = (body) => {
  const out = [];
  let started = false;
  for (const line of body) {
    if (line.trim().startsWith('|')) { started = true; out.push(line); }
    else if (started) break;
  }
  return out;
};

function matrixSections(text) {
  const sections = [];
  let cur = null;
  for (const line of text.split('\n')) {
    const h = line.match(/^#{2,4}\s+(.*)$/);
    if (h) {
      const mid = h[1].match(/(?:^|[^A-Za-z0-9])M(\d)(?:[^0-9]|$)/);
      if (mid) { cur = { title: h[1].trim(), id: `M${mid[1]}`, body: [] }; sections.push(cur); }
      else cur = null;
      continue;
    }
    if (cur) cur.body.push(line);
  }
  return sections;
}

// ---------- A2: 注册表 ----------
if (!fs.existsSync(OVERVIEW)) {
  fail(`找不到 ${path.relative(ROOT, OVERVIEW)}：ID 注册表是唯一事实来源，必须先建立`);
  process.exit(1);
}
const overview = fs.readFileSync(OVERVIEW, 'utf8');
const registry = new Map();
const duplicates = [];
for (const line of overview.split('\n')) {
  const m = line.match(/^\|\s*((?:EN|AP|BZ|SC|BA)(?:-AI)?-\d{2})\s*\|\s*([^|]+?)\s*\|/);
  if (!m) continue;
  if (registry.has(m[1])) duplicates.push(m[1]);
  registry.set(m[1], m[2]);
}
if (registry.size === 0) { fail('注册表为空：00-总览.md 里没解析到任何 ID 表格行'); process.exit(1); }
const counts = {};
for (const id of registry.keys()) counts[prefixOf(id)] = (counts[prefixOf(id)] ?? 0) + 1;
for (const [prefix, expected] of Object.entries(EXPECTED)) {
  if ((counts[prefix] ?? 0) !== expected) fail(`注册表 ${prefix} 层应有 ${expected} 个，实际 ${counts[prefix] ?? 0} 个`);
}
if (duplicates.length) fail(`注册表有重复 ID: ${[...new Set(duplicates)].join(', ')}`);
if (!failed) ok(`A2 注册表 ${registry.size} 个 ID（${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' ')}）`);

const idsOfPrefix = (p) => [...registry.keys()].filter((id) => prefixOf(id) === p);

// ---------- A3/A5: 各文档的层覆盖 ----------
const docText = new Map();
for (const [file, prefixes, name] of COVERAGE) {
  if (!fs.existsSync(file)) { fail(`A5 找不到 ${path.relative(ROOT, file)}（${name}）`); continue; }
  const text = fs.readFileSync(file, 'utf8');
  docText.set(file, text);
  const mm = stripComments(mermaidOf(text));
  if (!mm) { fail(`A5 ${name} 里没有 mermaid 块`); continue; }
  const missing = [...registry.keys()].filter((id) => prefixes.includes(prefixOf(id)) && !mm.includes(id));
  if (missing.length) fail(`A5 ${name} 缺少这些 ID: ${missing.join(', ')}`);
  else ok(`A${file === OVERVIEW ? '3' : '5'} ${name} 覆盖该层全部注册 ID`);
}

// ---------- A4: 幽灵 ID ----------
const mdFiles = fs.existsSync(V2) ? walk(V2) : [];
const ghost = [];
for (const file of mdFiles) {
  for (const m of fs.readFileSync(file, 'utf8').matchAll(ID_RE)) {
    if (!registry.has(m[0])) ghost.push(`${path.relative(ROOT, file)}: ${m[0]}`);
  }
}
ghost.length
  ? fail(`A4 出现注册表以外的 ID: ${[...new Set(ghost)].join('; ')}`)
  : ok(`A4 docs/v2 下 ${mdFiles.length} 份文档中无幽灵 ID`);

// ---------- A7: 从 Mermaid 边提取 BZ → SC 实线 ----------
const toRegistryId = (nodeId) => {
  const m = nodeId.match(/^(ENAI|EN|AP|BZ|SC|BA)(\d{2})G?$/);
  if (!m) return null;
  return m[1] === 'ENAI' ? `EN-AI-${m[2]}` : `${m[1]}-${m[2]}`;
};
const edgePairs = new Set();
for (const text of docText.values()) {
  for (const line of stripComments(mermaidOf(text)).split('\n')) {
    const t = line.trim();
    if (!t) continue;
    // 支持 `A --> B` 与带标签 `A -->|label| B`（第二轮评审 N7 盲区）
    const m = t.match(/^([A-Za-z0-9_]+)\s*-->\s*(?:\|[^|]*\|\s*)?([A-Za-z0-9_]+)$/);
    if (!m) continue;
    const from = toRegistryId(m[1]);
    const to = toRegistryId(m[2]);
    if (from && to && from.startsWith('BZ-') && to.startsWith('SC-')) edgePairs.add(`${from}→${to}`);
  }
}
ok(`A7 图上 BZ→SC 实线共 ${edgePairs.size} 条`);

// ---------- A6 + A7: 矩阵 ----------
if (!fs.existsSync(MATRICES)) {
  fail(`A6 找不到 ${path.relative(ROOT, MATRICES)}`);
} else {
  const sections = matrixSections(fs.readFileSync(MATRICES, 'utf8'));
  if (!sections.length) fail('A6 03-关系矩阵.md 里没有解析到矩阵小节（标题需含 M0/M1/...）');

  for (const section of sections) {
    const rows = firstTable(section.body);
    if (rows.length < 3) { fail(`A6 矩阵 ${section.title}: 表格行数不足（${rows.length} 行）`); continue; }
    const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    const colIds = cells(rows[0]).slice(1);
    const dataRows = rows.slice(2).map(cells);
    const rowIds = dataRows.map((r) => r[0]);
    const isIdMatrix = colIds.length > 0 && colIds.every((c) => registry.has(c));

    // 行列 ID 集合必须与注册表该层集合完全一致（第二轮评审 N7：原先只查数量）
    const checkSet = (label, ids, allowNonId) => {
      if (!ids.length) return;
      const prefixes = new Set(ids.map((x) => (registry.has(x) ? prefixOf(x) : '?')));
      if (prefixes.has('?')) {
        if (!allowNonId) fail(`A6 矩阵 ${section.id}: ${label}含未注册 ID（${ids.filter((x) => !registry.has(x)).join(', ')}）`);
        return;
      }
      if (prefixes.size > 1) { fail(`A6 矩阵 ${section.id}: ${label}混了多个层前缀 (${[...prefixes].join('/')})`); return; }
      const p = [...prefixes][0];
      const expected = new Set(idsOfPrefix(p));
      const actual = new Set(ids);
      if (actual.size !== ids.length) fail(`A6 矩阵 ${section.id}: ${label}有重复 ID`);
      const missing = [...expected].filter((x) => !actual.has(x));
      const extra = [...ids].filter((x) => !expected.has(x));
      if (missing.length) fail(`A6 矩阵 ${section.id}: ${label}缺少注册表里的 ${missing.join(', ')}`);
      if (extra.length) fail(`A6 矩阵 ${section.id}: ${label}多出注册表外的 ${extra.join(', ')}`);
      if (ids.length !== EXPECTED[p]) fail(`A6 矩阵 ${section.id}: ${label}是 ${p} 层，应有 ${EXPECTED[p]} 个，实际 ${ids.length} 个`);
    };
    checkSet('行', rowIds, false);
    checkSet('列', colIds, !isIdMatrix);
    if (!isIdMatrix) console.log(`  · ${section.id}：列不是 ID（用户侧等维度），仅校验取值、行集合与行宽`);

    let q = 0;
    let dots = 0;
    const pairs = new Set();
    for (const [i, row] of dataRows.entries()) {
      if (row.length !== colIds.length + 1) {
        fail(`A6 矩阵 ${section.id}: 第 ${i + 1} 行单元格数 ${row.length - 1}，表头是 ${colIds.length}`);
        continue;
      }
      for (const [j, v] of row.slice(1).entries()) {
        if (v === '?') q++;
        else if (v === '·') dots++;
        else if (!CELLS.has(v)) fail(`A6 矩阵 ${section.id}: 非法取值 "${v}"（只允许 ● ○ ? ·）`);
        if (isIdMatrix && v === '●') pairs.add(`${row[0]}→${colIds[j]}`);
      }
    }
    console.log(`  · ${section.id}：${dataRows.length}×${colIds.length}，● ${pairs.size} 格 / 待确认 ${q} 格 / 判定无关系 ${dots} 格`);

    if (section.id === 'M2') {
      const onlyEdges = [...edgePairs].filter((p) => !pairs.has(p));
      const onlyMatrix = [...pairs].filter((p) => !edgePairs.has(p));
      if (onlyEdges.length) fail(`A7 图上实线但 M2 未标 ●: ${onlyEdges.join(', ')}`);
      if (onlyMatrix.length) fail(`A7 M2 标 ● 但图上没有实线: ${onlyMatrix.join(', ')}`);
      if (!onlyEdges.length && !onlyMatrix.length) ok(`A7 M2 与图上 BZ→SC 实线完全一致（${pairs.size} 条）`);
    }
  }
}

console.log(failed ? '\nRESULT: FAIL' : '\nRESULT: PASS');
process.exit(failed ? 1 : 0);

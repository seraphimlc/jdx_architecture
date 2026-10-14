#!/usr/bin/env node
// 从 docs/v2 的 Markdown 事实来源生成"漂亮版"架构图（HTML → Chrome 无头截图 → PNG）。
//
// 为什么不靠浏览器回传尺寸：本机 Chrome 无头模式出完结果不退出，--dump-dom 也拿不到输出。
// 因此布局、坐标、连线路径全部在 Node 里算好，页面只用绝对定位渲染，截图一次到位。
//
// 数据来源（不新增事实来源，避免与 Mermaid 版分叉）：
//   docs/v2/00-总览.md      → ID 注册表（格子、名称、颜色族、形状、用户侧、? 标记）
//   docs/v2/03-关系矩阵.md  → M2 的 ● 关系（= 图上那 10 条实线）
// 用法: node tools/build-pretty.mjs [l0|all]
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const V2 = path.join(ROOT, 'docs/v2');
const OUT_HTML = path.join(ROOT, 'build');
const OUT_PNG = path.join(ROOT, 'assets/v2');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// Chrome 默认往 ~/Library 写 profile/crashpad，工作区外不可写 → HOME 与 profile 都指到 /tmp
const CHROME_ENV = { ...process.env, HOME: process.env.CHROME_HOME || '/tmp/chrome-home' };
const CHROME_PROFILE = process.env.CHROME_PROFILE_DIR || '/tmp/chrome-pretty';
const CHROME_FLAGS = ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-breakpad',
  '--disable-crash-reporter', '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${CHROME_PROFILE}`];

// ---------- 设计令牌 ----------
const T = {
  canvasW: 1760,
  padX: 40,
  padTop: 36,
  padBottom: 40,
  labelW: 78,
  labelGap: 18,
  bandPadX: 16,
  bandPadY: 14,
  cardGap: 10,
  bandGap: 14,
  bandGapWide: 58, // 业务场景 → 服务能力 之间留出连线空间
  headerH: 92,
  platformH: 64,
  legendH: 104,
  bg: '#eef1f5',
  bandBg: '#ffffff',
  bandBorder: '#e3e8ef',
  bandLabel: '#94a0b0',
  text: '#1f2937',
  sub: '#6b7280',
  idc: '#a3adbb',
  wire: '#b6bfcb',
  font: '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif',
  mono: '"SF Mono",ui-monospace,Menlo,monospace',
  shadow: '0 1px 2px rgba(16,24,40,.05), 0 2px 6px rgba(16,24,40,.08)',
  fam: {
    pink: { line: '#e8558a', bg: '#fff6fa', fg: '#a3195b' },
    orange: { line: '#ef8c1e', bg: '#fff9f0', fg: '#96590a' },
    yellow: { line: '#d9a300', bg: '#fffcef', fg: '#836600' },
    gray: { line: '#5b6472', bg: '#f5f7f9', fg: '#3c4553' },
    light: { line: '#aab2bd', bg: '#fbfcfd', fg: '#48505c' },
    purple: { line: '#8b5cf6', bg: '#f8f5ff', fg: '#5b21b6' },
    blue: { line: '#5b8def', bg: '#f5f9ff', fg: '#2b5bb5' },
    unknown: { line: '#9aa4b2', bg: '#ffffff', fg: '#6b7280' },
  },
};
const FAM_OF_CN = { 粉: 'pink', 橙: 'orange', 黄: 'yellow', 深灰: 'gray', 浅灰: 'light', 紫: 'purple' };
const CARD = { EN: { w: 152, h: 46 }, AP: { w: 232, h: 78 }, BZ: { w: 200, h: 62 }, SC: { w: 264, h: 76 }, BA: { w: 264, h: 76 } };
const BAND_TITLE = { EN: '入口', AP: '应用系统', BZ: '业务场景', SC: '服务能力', BA: '基础能力' };

// ---------- 解析 00-总览.md 的 ID 注册表 ----------
function parseRegistry() {
  const lines = fs.readFileSync(path.join(V2, '00-总览.md'), 'utf8').split('\n');
  const layers = new Map();
  let cur = null;
  let headers = null;
  for (const line of lines) {
    const h = line.match(/^###\s+3\.\d+\s+(.+?)`(EN|AP|BZ|SC|BA)`/);
    if (h) {
      cur = { rows: [] };
      layers.set(h[2], cur);
      headers = null;
      continue;
    }
    if (/^##\s/.test(line)) { cur = null; headers = null; continue; }
    if (!cur) continue;
    if (line.trim().startsWith('| ID |')) {
      headers = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      continue;
    }
    const m = line.match(/^\|\s*((?:EN|AP|BZ|SC|BA)(?:-AI)?-\d{2})\s*\|(.*)\|\s*$/);
    if (!m || !headers) continue;
    const cells = m[2].split('|').map((c) => c.trim());
    const row = { id: m[1] };
    headers.slice(1).forEach((hn, i) => {
      row[hn] = (cells[i] ?? '').replace(/\*\*/g, '').replace(/`/g, '').trim();
    });
    cur.rows.push(row);
  }
  return layers;
}

// ---------- 解析 03-关系矩阵.md ----------
function parseMatrix(mid) {
  const lines = fs.readFileSync(path.join(V2, '03-关系矩阵.md'), 'utf8').split('\n');
  let inSection = false;
  let colIds = null;
  const pairs = [];
  for (const line of lines) {
    const h = line.match(/^#{2,4}\s+(.*)$/);
    if (h) {
      inSection = new RegExp(`(?:^|[^A-Za-z0-9])${mid}(?:[^0-9]|$)`).test(h[1]);
      colIds = null;
      continue;
    }
    if (!inSection || !line.trim().startsWith('|')) continue;
    const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    if (!colIds) { colIds = cells.slice(1); continue; }
    if (/^-+$/.test(cells[1] ?? '')) continue;
    cells.slice(1).forEach((v, i) => { if (v === '●' && colIds[i]) pairs.push([cells[0], colIds[i]]); });
  }
  return pairs;
}

// ---------- 小工具 ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const famOf = (row, fallback) => FAM_OF_CN[(row['颜色族'] ?? row['颜色'] ?? '').trim()] ?? fallback;
const isUnknown = (row) => Object.values(row).some((v) => String(v).includes('?'));

// ---------- 布局引擎 ----------
class Canvas {
  constructor(width) { this.width = width; this.parts = []; this.nodes = new Map(); this.wires = []; }
  div(x, y, w, h, style, inner = '') {
    this.parts.push(`<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;${style}">${inner}</div>`);
  }
  raw(html) { this.parts.push(html); }
}

function cardHtml(row, { family, shape = 'round', badge, showSub = false }) {
  const f = T.fam[family] ?? T.fam.light;
  const unk = isUnknown(row);
  const radius = shape === 'capsule' ? 22 : 10;
  const dash = unk ? 'dashed' : 'solid';
  const sub = showSub && row['内部子项（v1 原文）'] && !row['内部子项（v1 原文）'].startsWith('（')
    ? `<div style="margin-top:5px;font-size:11px;line-height:1.45;color:${T.sub}">${esc(row['内部子项（v1 原文）'])}</div>` : '';
  return `<div style="border:1.5px ${dash} ${f.line};background:${f.bg};border-radius:${radius}px;padding:9px 12px;box-shadow:${T.shadow};height:100%;overflow:hidden">
    <div style="font-family:${T.mono};font-size:10.5px;letter-spacing:.3px;color:${T.idc}">${esc(row.id)}${badge ? ` <span style="color:#7c3aed">· ${esc(badge)}</span>` : (unk ? ' <span style="color:#9aa4b2">· ?</span>' : '')}</div>
    <div style="margin-top:2px;font-size:14px;font-weight:600;line-height:1.3;color:${f.fg}">${esc(row['名称'] ?? '')}</div>${sub}</div>`;
}

function placeBand(cv, y, prefix, rows, opts = {}) {
  const size = CARD[prefix];
  const areaW = T.canvasW - 2 * T.padX - T.labelW - T.labelGap - 2 * T.bandPadX;
  const perRow = Math.max(1, Math.floor((areaW + T.cardGap) / (size.w + T.cardGap)));
  const rowCount = Math.ceil(rows.length / perRow);
  const bandH = T.bandPadY * 2 + rowCount * size.h + (rowCount - 1) * T.cardGap;
  const bandX = T.padX;
  const bandW = T.canvasW - 2 * T.padX;

  cv.div(bandX, y, bandW, bandH,
    `background:${T.bandBg};border:1px solid ${T.bandBorder};border-radius:16px;box-shadow:0 1px 2px rgba(16,24,40,.04)`,
    '');
  cv.div(bandX, y, T.labelW, bandH, 'display:flex;align-items:center;justify-content:center;',
    `<div style="writing-mode:vertical-rl;letter-spacing:7px;font-size:13.5px;font-weight:600;color:${T.bandLabel}">${esc(BAND_TITLE[prefix])}</div>`);
  cv.div(bandX + T.labelW, y, 1, bandH, `background:${T.bandBorder}`);

  rows.forEach((row, i) => {
    const r = Math.floor(i / perRow);
    const c = i % perRow;
    const x = bandX + T.labelW + T.labelGap + T.bandPadX + c * (size.w + T.cardGap);
    const cy = y + T.bandPadY + r * (size.h + T.cardGap);
    const family = opts.familyOf ? opts.familyOf(row) : famOf(row, opts.family ?? 'blue');
    cv.div(x, cy, size.w, size.h, '',
      cardHtml(row, {
        family, shape: opts.shape ?? 'round', showSub: opts.showSub,
        badge: row.id.startsWith('EN-AI') ? 'AI 渠道' : undefined,
      }));
    cv.nodes.set(row.id, { x, y: cy, w: size.w, h: size.h, cx: x + size.w / 2 });
  });
  return { y, h: bandH, bottom: y + bandH, top: y };
}

function wirePath(x1, y1, x2, y2) {
  const dy = Math.max(18, (y2 - y1) * 0.5);
  return `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2 - 4}`;
}

// ---------- L0 总图 ----------
function buildL0(layers) {
  const cv = new Canvas(T.canvasW);
  const title = 'BilionPass 架构图 v2 · L0 总览';
  const subtitle = '平台带 + 5 层 · 53 格 · 每格带 ID · 由 docs/v2/00-总览.md 与 03-关系矩阵.md 生成';

  cv.div(T.padX, T.padTop, T.canvasW - 2 * T.padX, T.headerH, '',
    `<div style="font-size:30px;font-weight:600;letter-spacing:.2px;color:${T.text}">${esc(title)}</div>
     <div style="margin-top:9px;font-size:13.5px;color:${T.sub}">${esc(subtitle)}</div>`);

  let y = T.padTop + T.headerH;

  // 平台带
  const plats = [
    { name: 'BilionPass[综合平台，C端]', side: 'C 端', flex: 3, line: '#8f98a5', bg: '#fbfcfd', fg: '#39414d' },
    { name: '商户平台[B端]', side: 'B 端', flex: 2, line: '#8b5cf6', bg: '#f8f6ff', fg: '#5b21b6' },
    { name: '管理平台[A端]', side: 'A 端', flex: 2, line: '#5b6472', bg: '#f5f7f9', fg: '#39414d' },
  ];
  const totalFlex = plats.reduce((s, p) => s + p.flex, 0);
  const gap = 14;
  const usable = T.canvasW - 2 * T.padX - gap * (plats.length - 1);
  let px = T.padX;
  for (const p of plats) {
    const w = Math.round((usable * p.flex) / totalFlex);
    cv.div(px, y, w, T.platformH,
      `border:1.5px solid ${p.line};background:${p.bg};border-radius:14px;padding:12px 18px;box-shadow:${T.shadow}`,
      `<div style="font-size:16px;font-weight:600;color:${p.fg}">${esc(p.name)}</div>
       <div style="margin-top:4px;font-size:11.5px;color:${T.sub}">${esc(p.side)}</div>`);
    px += w + gap;
  }
  y += T.platformH + T.bandGap + 4;

  const bands = {};
  const need = (p) => (layers.get(p)?.rows ?? []);
  const order = [
    ['EN', { family: 'light', shape: 'capsule' }],
    ['AP', { familyOf: (r) => famOf(r, 'yellow') }],
    ['BZ', {}],
    ['SC', { family: 'blue' }],
    ['BA', { family: 'blue' }],
  ];
  let wideBefore = false;
  for (const [prefix, opts] of order) {
    if (wideBefore) y += T.bandGapWide - T.bandGap;
    bands[prefix] = placeBand(cv, y, prefix, need(prefix), opts);
    y = bands[prefix].bottom + T.bandGap;
    if (prefix === 'BZ') wideBefore = true;
  }
  const contentBottom = y - T.bandGap;

  // 连线：业务场景 → 服务能力（M2 的 10 条），只画在两带之间的空隙里，避免压住卡片
  const edges = parseMatrix('M2');
  for (const [from, to] of edges) {
    const a = cv.nodes.get(from);
    const b = cv.nodes.get(to);
    if (!a || !b) continue;
    cv.wires.push(`<path d="${wirePath(a.cx, bands.BZ.bottom + 1, b.cx, bands.SC.top - 1)}" fill="none" stroke="${T.wire}" stroke-width="1.6" marker-end="url(#ah)"/>`);
  }

  // 图例
  const ly = contentBottom + 22;
  const fam = (k, label) => `<span style="display:inline-block;width:11px;height:11px;border-radius:3px;background:${T.fam[k].line};margin:0 5px -1px 10px"></span>${esc(label)}`;
  cv.div(T.padX, ly, T.canvasW - 2 * T.padX, T.legendH,
    `background:#fff;border:1px solid ${T.bandBorder};border-radius:14px;padding:15px 18px;box-shadow:0 1px 2px rgba(16,24,40,.04)`,
    `<div style="font-size:12.5px;color:${T.sub};line-height:1.9">
      <div><b style="color:${T.text}">颜色 = 应用系统族</b>${fam('pink', '行前购')}${fam('orange', '空手行 / 佐川物流')}${fam('yellow', '综合平台系')}${fam('gray', '管理端')}${fam('light', 'C 端入口')}</div>
      <div><b style="color:${T.text}">虚线边框</b> = 待作者确认（<code style="font-family:${T.mono};background:#f2f4f7;border-radius:4px;padding:1px 4px">?</code>）或 AI 渠道 &nbsp;·&nbsp; <b style="color:${T.text}">实线箭头</b> = 业务场景 → 服务能力（v1 已有的 10 条）</div>
      <div>其余关系（入口归属、场景↔系统、能力↔基础能力、跨端共用）见 <code style="font-family:${T.mono};background:#f2f4f7;border-radius:4px;padding:1px 4px">docs/v2/03-关系矩阵.md</code></div>
     </div>`);

  const height = ly + T.legendH + T.padBottom;
  return { title, html: cv.parts.join('\n'), wires: cv.wires.join('\n'), width: T.canvasW, height };
}

// ---------- 页面模板（无 JS，纯静态） ----------
function page(fig) {
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(fig.title)}</title></head>
<body style="margin:0;width:${fig.width}px;height:${fig.height}px;background:${T.bg};font-family:${T.font};-webkit-font-smoothing:antialiased">
  <div style="position:relative;width:${fig.width}px;height:${fig.height}px">
    <svg width="${fig.width}" height="${fig.height}" style="position:absolute;left:0;top:0">
      <defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="${T.wire}"/></marker></defs>
      ${fig.wires}
    </svg>
${fig.html}
  </div>
</body></html>`;
}

// ---------- 截图（轮询 PNG 落地，拿到就杀进程） ----------
async function screenshotPoll(htmlPath, pngPath, width, height, timeoutMs = 60000) {
  fs.rmSync(pngPath, { force: true });
  const child = spawn(CHROME, [
    ...CHROME_FLAGS, '--hide-scrollbars', '--force-device-scale-factor=2',
    `--window-size=${width},${height}`, `--screenshot=${pngPath}`, `file://${htmlPath}`,
  ], { env: CHROME_ENV, stdio: 'ignore' });
  const started = Date.now();
  let last = -1;
  let stable = 0;
  while (Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 400));
    if (!fs.existsSync(pngPath)) continue;
    const size = fs.statSync(pngPath).size;
    if (size > 1000 && size === last) { if (++stable >= 2) break; } else stable = 0;
    last = size;
  }
  try { child.kill('SIGKILL'); } catch {}
  if (!fs.existsSync(pngPath) || fs.statSync(pngPath).size <= 1000) throw new Error('截图未产出');
}

// ---------- 主流程 ----------
const which = (process.argv[2] ?? 'l0').toLowerCase();
fs.mkdirSync(OUT_HTML, { recursive: true });
fs.mkdirSync(OUT_PNG, { recursive: true });
fs.mkdirSync('/tmp/chrome-home', { recursive: true });

const layers = parseRegistry();
if (!layers.size) { console.error('✗ 未能从 00-总览.md 解析出注册表'); process.exit(1); }
console.log(`· 注册表：${[...layers].map(([k, v]) => `${k}=${v.rows.length}`).join(' ')}`);

const figures = { l0: buildL0(layers) };
if (!figures[which] && which !== 'all') { console.error(`✗ 未知图名 "${which}"（可选 l0 / all）`); process.exit(1); }

for (const [name, fig] of Object.entries(figures)) {
  if (which !== 'all' && which !== name) continue;
  const htmlPath = path.join(OUT_HTML, `${name}.html`);
  fs.writeFileSync(htmlPath, page(fig), 'utf8');
  const pngPath = path.join(OUT_PNG, `${name}.png`);
  await screenshotPoll(htmlPath, pngPath, fig.width, fig.height);
  const kb = (fs.statSync(pngPath).size / 1024).toFixed(0);
  console.log(`✓ ${name}: ${path.relative(ROOT, htmlPath)} → ${path.relative(ROOT, pngPath)}`);
  console.log(`  画布 ${fig.width}×${fig.height} CSS px · 2x 位图 ${fig.width * 2}×${fig.height * 2} · ${kb} KB`);
}

#!/usr/bin/env node
// 从 docs/site/content.mjs + landscape.mjs 生成单文件 HTML 说明文档。
// 结构：一个干净的业务全景图（每框可点）+ 每框一个说明页（hash 路由 #/b/<id>）+ 可嵌子图表。
// 用法: node tools/build-docs.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'docs/site/index.html');
const { meta, businesses, diagnosis, blocks, pendingBlocks, facts } = await import(
  path.join(ROOT, 'docs/site/content.mjs')
);
const L = await import(path.join(ROOT, 'docs/site/landscape.mjs'));

// ---------- 小工具 ----------
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const md = (s) =>
  esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
const slug = (s) =>
  String(s).replace(/[\s/·（）()、，,]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
const TONE = {
  在跑: 'run', 部分: 'partial', 对接中: 'partial', 待推广: 'partial', 浅实现: 'partial',
  开发中: 'dev', 规划中: 'plan', 未上线: 'plan', 未启动: 'none', 未定义: 'none', 待对齐: 'none',
};
const toneOf = (s) => TONE[String(s).replace(/（.*?）/, '').trim()] ?? 'plan';
const badge = (s) => `<span class="badge ${toneOf(s)}">${esc(s)}</span>`;
const DOT = { run: '#16a34a', partial: '#e0a800', dev: '#2563eb', plan: '#9aa4b2', none: '#dc2626' };
const textW = (s, fs) => [...String(s)].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2e80 ? fs : fs * 0.55), 0);

// ---------- 节点表（全景图上每个框 = 一个节点 = 一个说明页） ----------
const allBiz = businesses.flatMap((g) => g.items.map((it) => ({ ...it, group: g.group })));
const nodes = [];
L.ends.forEach((e) => nodes.push({ id: `end-${slug(e.name)}`, kind: '端', name: e.name, status: e.status, lines: [e.sub] }));
L.exits.forEach((g) => nodes.push({
  id: `exit-${slug(g.group)}`, kind: '分发出口', name: g.group, tag: g.tag,
  lines: [...(g.forms ? [`三种形态：${g.forms.join(' · ')}`] : []), ...(g.items ?? [])],
  note: g.note,
}));
allBiz.forEach((it) => nodes.push({
  id: `b-${slug(it.name)}`, kind: '产品与服务内容', name: it.name, status: it.status,
  lines: [`所属组：${it.group}`, `供给：${it.supply}`, `分发：${it.dist}`],
}));
L.suppliers.forEach((s) => nodes.push({ id: `sup-${slug(s.name)}`, kind: '合作供给方', name: s.name, tag: s.tag, lines: [s.sub] }));
L.systems.forEach((s) => nodes.push({ id: `sys-${slug(s.name)}`, kind: '自有平台系统', name: s.name, lines: [s.sub] }));
// 已有富内容的块：能对上全景图上的框就挂上去，对不上的（如中枢职能）另建一页
for (const b of blocks) {
  const nm = b.name.replace(/^[①②③④⑤⑥⑦⑧⑨]\s*/, '');
  const existing = nodes.find((n) => n.name === nm);
  if (existing) existing.rich = b;
  else nodes.push({ id: `blk-${slug(b.name)}`, kind: `${b.group}（不在全景图上，从左侧导航进）`, name: nm, status: b.badge, lines: [b.oneliner], rich: b });
}
const idOf = new Map(nodes.map((n) => [n.name, n.id]));
const pageId = (id) => `page-${id}`;

// ---------- SVG 基础 ----------
const svgWrap = (W, H, body) =>
  `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img">\n  <defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#cbd3de"/></marker></defs>\n  ${body}\n</svg>`;
const bandLabel = (cx, y, h, label) => {
  const ly = y + h / 2;
  return `<text x="${cx}" y="${ly}" font-size="12.5" font-weight="600" fill="#8a95a5" text-anchor="middle" transform="rotate(-90 ${cx} ${ly})" letter-spacing="3">${esc(label)}</text>`;
};
// 可点击的框：外包一层 <g class="bx" data-block="...">
function box(x, y, w, h, o) {
  const out = [`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="${o.fill ?? '#fff'}" stroke="${o.stroke ?? '#dfe4ec'}"${o.dash ? ' stroke-dasharray="4 3"' : ''}/>`];
  const ty = y + (o.pad ?? 21);
  out.push(`<text x="${x + 12}" y="${ty}" font-size="${o.fs ?? 13}" font-weight="600" fill="${o.fg ?? '#1f2937'}">${esc(o.title)}</text>`);
  if (o.l2) out.push(`<text x="${x + 12}" y="${ty + 17}" font-size="11.5" fill="#4b5563">${esc(o.l2)}</text>`);
  if (o.l3) out.push(`<text x="${x + 12}" y="${ty + 33}" font-size="11" fill="#9aa4b2">${esc(o.l3)}</text>`);
  if (o.tag) {
    const tc = { 股东: '#b45309', 已签约: '#5b21b6', 规划: '#6b7280', 合作: '#0f766e', 我方: '#1d4ed8' }[o.tag] ?? '#7c3aed';
    const tw = textW(o.tag, 10.5) + 14;
    out.push(
      `<rect x="${x + w - tw - 10}" y="${y + 9}" width="${tw}" height="17" rx="8" fill="#fff" stroke="${tc}" stroke-opacity=".45"/>`,
      `<text x="${x + w - tw / 2 - 10}" y="${y + 21}" font-size="10.5" fill="${tc}" text-anchor="middle">${esc(o.tag)}</text>`,
    );
  }
  if (o.dot) out.push(`<circle cx="${x + w - 14}" cy="${y + h - 13}" r="4" fill="${DOT[toneOf(o.dot)]}"/>`);
  const inner = out.join('');
  return o.block
    ? `<g class="bx" data-block="${esc(o.block)}" tabindex="0">${inner}</g>`
    : `<g>${inner}</g>`;
}
function chips(x, y, maxW, items, { h = 24, gap = 6, fs = 12, fill = '#f8fafc', stroke = '#e3e8ef', fg = '#374151' } = {}) {
  let cx = x, cy = y, rows = 1;
  const out = [];
  for (const it of items) {
    const w = Math.round(textW(it, fs)) + 20;
    if (cx + w > x + maxW) { cx = x; cy += h + gap; rows++; }
    out.push(
      `<rect x="${cx}" y="${cy}" width="${w}" height="${h}" rx="12" fill="${fill}" stroke="${stroke}"/>`,
      `<text x="${cx + w / 2}" y="${cy + 16}" font-size="${fs}" fill="${fg}" text-anchor="middle">${esc(it)}</text>`,
    );
    cx += w + gap;
  }
  return { svg: out.join(''), height: rows * h + (rows - 1) * gap };
}

// ---------- 图 1：业务全景（干净版） ----------
function svgBusiness() {
  const W = 1120, PAD = 18, LABELW = 88, GAPL = 14, CG = 10;
  const cx = PAD + LABELW + GAPL;
  const cw = W - PAD - cx;
  const p = [];
  let y = PAD;
  const band = (label, h) => {
    p.push(`<rect x="${PAD}" y="${y}" width="${W - PAD * 2}" height="${h}" rx="12" fill="#fff" stroke="#e3e8ef"/>`);
    p.push(bandLabel(PAD + LABELW / 2, y, h, label));
  };

  // ① 三端
  band('三端', 88);
  const wEnd = Math.floor((cw - CG * 2) / 3);
  L.ends.forEach((e, i) => {
    p.push(box(cx + i * (wEnd + CG), y + 14, wEnd, 60, {
      title: e.name, l2: e.sub, dot: e.status, block: `end-${slug(e.name)}`,
      fill: '#f6faff', stroke: '#5b8def', fg: '#2b5bb5',
    }));
  });
  y += 88 + 16;

  // ② 分发出口
  const wGrp = Math.floor((cw - CG * 2) / 3);
  const grpInner = wGrp - 24;
  const hForms = L.exits.some((g) => g.forms) ? chips(0, 0, grpInner, ['会员权益', '积分消耗']).height + 8 : 0;
  const hItems = Math.max(...L.exits.map((g) => chips(0, 0, grpInner, (g.items ?? []).slice(0, 2)).height));
  const boxH = 14 + 18 + hForms + hItems + 24;
  const hB2 = 14 + boxH + 14;
  band('分发出口', hB2);
  L.exits.forEach((g, i) => {
    const x = cx + i * (wGrp + CG);
    const id = `exit-${slug(g.group)}`;
    p.push(
      `<g class="bx" data-block="${esc(id)}" tabindex="0">`,
      `<rect x="${x}" y="${y + 14}" width="${wGrp}" height="${boxH}" rx="9" fill="#fbfcfe" stroke="#dfe4ec"/>`,
      `<text x="${x + 12}" y="${y + 34}" font-size="12" font-weight="600" fill="#4b5563">${esc(g.group)}</text>`,
    );
    if (g.tag) {
      const tw = textW(g.tag, 10.5) + 14;
      p.push(
        `<rect x="${x + wGrp - tw - 10}" y="${y + 22}" width="${tw}" height="17" rx="8" fill="#fff" stroke="#e6c86a"/>`,
        `<text x="${x + wGrp - tw / 2 - 10}" y="${y + 34}" font-size="10.5" fill="#b08a2e" text-anchor="middle">${esc(g.tag)}</text>`,
      );
    }
    let cy = y + 42;
    if (g.forms) { p.push(chips(x + 12, cy, grpInner, g.forms.slice(0, 2)).svg); cy += hForms; }
    p.push(chips(x + 12, cy, grpInner, (g.items ?? []).slice(0, 2)).svg);
    if ((g.items ?? []).length > 2) {
      p.push(`<text x="${x + 12}" y="${y + 14 + boxH - 10}" font-size="10.5" fill="#9aa4b2">还有 ${g.items.length - 2} 项，点开看</text>`);
    }
    p.push('</g>');
  });
  y += hB2 + 16;

  // ③ 产品与服务内容（干净：只有名称 + 状态）
  const perRow = 3, cardH = 56;
  const wCard = Math.floor((cw - CG * (perRow - 1)) / perRow);
  const rows = Math.ceil(allBiz.length / perRow);
  const hB3 = 14 + rows * cardH + (rows - 1) * 8 + 14;
  band('产品与服务内容', hB3);
  allBiz.forEach((it, i) => {
    const x = cx + (i % perRow) * (wCard + CG);
    const yy = y + 14 + Math.floor(i / perRow) * (cardH + 8);
    p.push(box(x, yy, wCard, cardH, {
      title: it.name, dot: it.status, block: `b-${slug(it.name)}`, pad: 22, fs: 14.5,
      l2: it.group, fill: '#fffdf7', stroke: '#e6c86a',
    }));
  });
  y += hB3 + 16;

  // ④ 合作供给方
  const perRowS = 3, supH = 58;
  const wSup = Math.floor((cw - CG * (perRowS - 1)) / perRowS);
  const sRows = Math.ceil(L.suppliers.length / perRowS);
  const hB4 = 14 + sRows * supH + (sRows - 1) * CG + 14;
  band('合作供给方', hB4);
  L.suppliers.forEach((s, i) => {
    const x = cx + (i % perRowS) * (wSup + CG);
    const yy = y + 14 + Math.floor(i / perRowS) * (supH + CG);
    p.push(box(x, yy, wSup, supH, {
      title: s.name, l2: s.sub, tag: s.tag, block: `sup-${slug(s.name)}`,
      fill: '#f7fdf9', stroke: '#79c39a', fg: '#17663c', fs: 12.5,
    }));
  });
  y += hB4 + 16;

  // ⑤ 自有平台系统
  const perRowY = 4, sysH = 54;
  const wSys = Math.floor((cw - CG * (perRowY - 1)) / perRowY);
  const yRows = Math.ceil(L.systems.length / perRowY);
  const hB5 = 14 + yRows * sysH + (yRows - 1) * CG + 14;
  band('自有平台系统', hB5);
  L.systems.forEach((s, i) => {
    const x = cx + (i % perRowY) * (wSys + CG);
    const yy = y + 14 + Math.floor(i / perRowY) * (sysH + CG);
    p.push(box(x, yy, wSys, sysH, {
      title: s.name, l2: s.sub, block: `sys-${slug(s.name)}`, fs: 12.5, fill: '#fafbfc', stroke: '#ced5df',
    }));
  });
  y += hB5 + PAD;
  return svgWrap(W, y, p.join('\n  '));
}

// ---------- 图 2：平台能力现状 ----------
function svgCapability() {
  const W = 1120, PAD = 18, LABELW = 88, GAPL = 14;
  const cx = PAD + LABELW + GAPL;
  const cw = W - PAD - cx;
  const p = [];
  const h = 132;
  p.push(`<rect x="${PAD}" y="${PAD}" width="${W - PAD * 2}" height="${h}" rx="12" fill="#fff" stroke="#e3e8ef"/>`);
  p.push(bandLabel(PAD + LABELW / 2, PAD, h, '平台能力'));
  const half = Math.floor((cw - 14) / 2);
  p.push(
    `<rect x="${cx}" y="${PAD + 14}" width="${half}" height="${h - 28}" rx="9" fill="#f7fdf9" stroke="#79c39a"/>`,
    `<text x="${cx + 12}" y="${PAD + 38}" font-size="12.5" font-weight="600" fill="#17663c">已自研在跑（4）</text>`,
    chips(cx + 12, PAD + 48, half - 24, L.capabilities.running, { fill: '#fff', stroke: '#a7e8c0', fg: '#166534' }).svg,
  );
  const x2 = cx + half + 14;
  p.push(
    `<rect x="${x2}" y="${PAD + 14}" width="${half}" height="${h - 28}" rx="9" fill="#fafbfc" stroke="#ced5df"/>`,
    `<text x="${x2 + 12}" y="${PAD + 38}" font-size="12.5" font-weight="600" fill="#6b7280">还没做（7）</text>`,
    chips(x2 + 12, PAD + 48, half - 24, L.capabilities.planning, { fill: '#fff', stroke: '#e3e8ef', fg: '#6b7280' }).svg,
  );
  return svgWrap(W, PAD * 2 + h, p.join('\n  '));
}

// ---------- 子图表：链式图 ----------
function svgChain(items) {
  const n = items.length, W = 1120, PAD = 18, gap = 34;
  const w = Math.floor((W - PAD * 2 - gap * (n - 1)) / n);
  const p = [];
  items.forEach((t, i) => {
    const x = PAD + i * (w + gap);
    p.push(`<rect x="${x}" y="16" width="${w}" height="52" rx="9" fill="#f6faff" stroke="#5b8def"/>`);
    // 折行
    const fs = 12.5;
    const maxW = w - 24;
    const chars = [...t];
    const lines = [];
    let cur = '';
    for (const ch of chars) {
      if (textW(cur + ch, fs) > maxW) { lines.push(cur); cur = ch; } else cur += ch;
    }
    if (cur) lines.push(cur);
    lines.slice(0, 3).forEach((ln, li) => {
      p.push(`<text x="${x + 12}" y="${38 + li * 16}" font-size="${fs}" fill="#1f2937">${esc(ln)}</text>`);
    });
    if (i < n - 1) {
      const ax = x + w + 6, ay = 42;
      p.push(`<line x1="${ax}" y1="${ay}" x2="${ax + gap - 14}" y2="${ay}" stroke="#cbd3de" stroke-width="1.4" marker-end="url(#ah)"/>`);
    }
  });
  return svgWrap(W, 84, p.join('\n  '));
}

// ---------- 导航 ----------
function nav() {
  const overview = [
    ['#/ov', '业务全景'],
    ['#/cap', '平台能力现状'],
    ['#/diag', '关键诊断'],
    ['#/facts', '事实清单'],
  ];
  const groups = new Map();
  const seen = new Set();
  const push = (g, name) => {
    const id = idOf.get(name);
    if (!id || seen.has(name)) return; // 同名只列一次（说明页可能落在已有分组里）
    seen.add(name);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push([`#/b/${encodeURIComponent(id)}`, name]);
  };
  allBiz.forEach((it) => push('产品与服务内容', it.name));
  L.suppliers.forEach((s) => push('合作供给方', s.name));
  L.systems.forEach((s) => push('自有平台系统', s.name));
  L.ends.forEach((e) => push('三端', e.name));
  L.exits.forEach((g) => push('分发出口', g.group));
  blocks.forEach((b) => push('已有说明', b.name.replace(/^[①②③④⑤⑥⑦⑧⑨]\s*/, '')));
  L.exits.forEach((g) => push('分发出口', g.group));
  L.systems.forEach((s) => push('自有平台系统', s.name));
  const out = [`<div class="navg">总览</div>` + overview.map(([h, t]) => `<a href="${h}">${esc(t)}</a>`).join('')];
  for (const [g, items] of groups) {
    out.push(`<div class="navg">${esc(g)}</div>` + items.map(([h, t]) => `<a href="${h}">${esc(t)}</a>`).join(''));
  }
  out.push(
    `<div class="navg">待补</div>` +
      pendingBlocks.map((g) => `<a href="#/ov" class="todolink">${esc(g.group)} ${g.names.length} 块未写</a>`).join(''),
  );
  return out.join('');
}

// ---------- 说明页 ----------
function renderPage(n) {
  const b = n.rich;
  if (b) {
    const list = (arr) => `<ul>${arr.map((x) => `<li>${md(x)}</li>`).join('')}</ul>`;
    const dep = b.deps
      ? `<h4>依赖 / 协作</h4><div class="deps">
      ${b.deps.supply ? `<div><span class="dl">供给方</span>${b.deps.supply.map(refLink).join(' · ')}</div>` : ''}
      ${b.deps.hub ? `<div><span class="dl">中枢职能</span>${esc(b.deps.hub.join(' · '))}</div>` : ''}
      ${b.deps.distribution ? `<div><span class="dl">分发线</span>${b.deps.distribution.map(refLink).join(' · ')}</div>` : ''}
    </div>`
      : '';
    const chain = L.chains[n.name] ? `<h4>子图表</h4>${svgChain(L.chains[n.name])}` : '';
    return `<div class="bpage" id="${pageId(n.id)}" hidden>
      <a class="backlink" href="#/ov">← 返回业务全景</a>
      <h2>${esc(b.name)} ${badge(b.badge)}</h2>
      <div class="kind">${esc(n.kind)}</div>
      <p class="oneliner">${md(b.oneliner)}</p>
      <div class="meta">${b.audience ? `服务对象：${esc(b.audience)} · ` : ''}来源：${esc(b.source ?? '')}</div>
      <h4>现状</h4>${list(b.current)}
      ${dep}${chain}
      <h4>下一步规划</h4>${list(b.next)}
      <h4>【判断】</h4>${list(b.judgment)}
      <h4>【待确认】</h4>${list(b.open)}
    </div>`;
  }
  const chain = L.chains[n.name] ? `<h4>子图表</h4>${svgChain(L.chains[n.name])}` : '';
  return `<div class="bpage" id="${pageId(n.id)}" hidden>
    <a class="backlink" href="#/ov">← 返回业务全景</a>
    <h2>${esc(n.name)} ${n.status ? badge(n.status) : ''} ${n.tag ? `<span class="tag">${esc(n.tag)}</span>` : ''}</h2>
    <div class="kind">${esc(n.kind)}</div>
    ${n.lines?.length ? `<h4>要点</h4><ul>${n.lines.map((x) => `<li>${md(x)}</li>`).join('')}</ul>` : ''}
    ${n.note ? `<div class="todo">${md(n.note)}</div>` : ''}
    ${chain}
    <h4>下一步规划</h4><div class="todo">【待补】这一块的现状、规划、依赖关系还没整理。素材见 <code>docs/业务与系统全貌备忘.md</code> 与 <code>docs/平台大框架.md</code>。</div>
  </div>`;
}
const refLink = (name) => {
  const id = idOf.get(String(name).replace(/^[①②③④⑤⑥⑦⑧⑨]\s*/, ''));
  return id ? `<a href="#/b/${encodeURIComponent(id)}">${esc(name)}</a>` : esc(name);
};

// ---------- 页面 ----------
const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title)} · ${esc(meta.subtitle)}</title>
<style>
  * { box-sizing:border-box; }
  :root { --ink:#1f2937; --sub:#6b7280; --faint:#9aa4b2; --line:#e3e8ef; --bg:#f6f8fb; --blue:#2b5bb5; }
  html { scroll-behavior:smooth; }
  body { margin:0; background:var(--bg); color:var(--ink);
         font:15px/1.75 -apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif; }
  code { font:12.5px/1.5 "SF Mono",ui-monospace,Menlo,monospace; background:#eef1f5; border-radius:4px; padding:1px 5px; }
  a { color:var(--blue); text-decoration:none; } a:hover { text-decoration:underline; }
  aside { position:fixed; top:0; left:0; bottom:0; width:248px; overflow-y:auto; background:#fff;
          border-right:1px solid var(--line); padding:22px 14px 40px; }
  aside .brand { font-weight:600; font-size:15px; padding:0 8px 3px; }
  aside .brandsub { font-size:12px; color:var(--faint); padding:0 8px 14px; border-bottom:1px solid var(--line); margin-bottom:10px; }
  .navg { font-size:11.5px; color:var(--faint); letter-spacing:1px; margin:14px 8px 4px; }
  aside a { display:block; padding:5px 8px; border-radius:6px; font-size:13.5px; color:#374151; }
  aside a:hover { background:#f1f5f9; text-decoration:none; }
  aside a.todolink { color:var(--faint); font-size:12.5px; }
  main { margin-left:248px; padding:28px 40px 80px; max-width:1240px; }
  header.top { display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; margin-bottom:6px; }
  h1 { font-size:26px; margin:0; letter-spacing:.2px; }
  .pos { font-size:14px; color:var(--blue); background:#eef4ff; border:1px solid #cfe0ff; border-radius:999px; padding:3px 12px; }
  .topmeta { font-size:12.5px; color:var(--faint); margin-bottom:26px; }
  section, .bpage { background:#fff; border:1px solid var(--line); border-radius:14px; padding:22px 26px; margin-bottom:18px; }
  h2 { font-size:19px; margin:0 0 10px; }
  h4 { font-size:13px; color:var(--sub); margin:18px 0 6px; letter-spacing:.3px; }
  ul { margin:6px 0; padding-left:20px; } li { margin:4px 0; }
  .oneliner { font-size:15.5px; color:#111827; margin:6px 0 2px; }
  .meta, .kind { font-size:12px; color:var(--faint); margin-bottom:6px; }
  .badge { display:inline-block; font-size:11.5px; font-weight:600; border-radius:6px; padding:1px 8px; vertical-align:middle; }
  .badge.run { color:#166534; background:#ecfdf3; border:1px solid #a7e8c0; }
  .badge.partial { color:#8a6a00; background:#fffaeb; border:1px solid #e6d08a; }
  .badge.dev { color:#1d4ed8; background:#eff6ff; border:1px solid #bcd4ff; }
  .badge.plan { color:#4b5563; background:#f3f4f6; border:1px solid #dfe3e8; }
  .badge.none { color:#b91c1c; background:#fef2f2; border:1px solid #f3c0c0; }
  .tag { display:inline-block; font-size:11.5px; color:#7c3aed; border:1px solid #ddd0fb; background:#f7f4ff; border-radius:6px; padding:1px 8px; vertical-align:middle; }
  .deps { display:flex; flex-direction:column; gap:4px; font-size:13.5px; }
  .dl { display:inline-block; min-width:74px; color:var(--faint); font-size:12.5px; }
  .backlink { font-size:12.5px; color:var(--faint); display:inline-block; margin-bottom:8px; }
  svg { display:block; margin:6px 0 4px; }
  g.bx { cursor:pointer; } g.bx:hover rect { filter:brightness(.96); } g.bx:focus { outline:none; }
  .legend { font-size:12.5px; color:var(--sub); margin-top:10px; }
  .legend i { display:inline-block; width:9px; height:9px; border-radius:50%; margin:0 4px 0 12px; }
  .callout { border-left:3px solid #cfe0ff; background:#f7faff; border-radius:0 8px 8px 0; padding:10px 14px; margin:10px 0 4px; font-size:14px; color:#374151; }
  table { border-collapse:collapse; width:100%; font-size:13.5px; margin-top:8px; }
  th, td { border:1px solid var(--line); padding:7px 10px; text-align:left; vertical-align:top; }
  th { background:#f8fafc; font-weight:600; color:#374151; font-size:12.5px; }
  .diag { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-top:8px; }
  .diag .card { border:1px solid var(--line); border-radius:10px; padding:14px; }
  .diag .rank { font-size:11.5px; color:var(--faint); }
  .diag .nm { font-size:15px; font-weight:600; margin:2px 0 4px; }
  .diag .now { font-size:12.5px; color:#b91c1c; margin-bottom:6px; }
  .todo { border:1px dashed #d5dbe3; background:#fcfeff; border-radius:10px; padding:12px 16px; color:var(--sub); font-size:13.5px; }
  @media print {
    aside { display:none; } main { margin:0; max-width:none; padding:0; }
    body { background:#fff; font-size:12px; }
    section, .bpage { border:none; padding:0 0 10px; margin-bottom:10px; break-inside:avoid; }
    .bpage { display:block !important; } a { color:inherit; text-decoration:none; }
  }
</style></head>
<body>
<aside>
  <div class="brand">${esc(meta.title)}</div>
  <div class="brandsub">${esc(meta.subtitle)} ｜ ${esc(meta.version)} ｜ ${esc(meta.updated)}</div>
  ${nav()}
</aside>
<main>
  <header class="top"><h1>${esc(meta.title)}</h1><span class="pos">${esc(meta.positioning)}</span></header>
  <div class="topmeta">${esc(meta.subtitle)} ｜ ${esc(meta.version)} ｜ 更新 ${esc(meta.updated)}　${esc(meta.sourceNote)}</div>

  <div id="view-overview">
    <section id="ov">
      <h2>业务全景</h2>
      <div class="callout">${md(L.positioning.toChannel)}<br>${md(L.positioning.toConsumer)}</div>
      <p class="oneliner">每个框都能点开，看它自己的说明。</p>
      ${svgBusiness()}
      <div class="legend">
        状态：<i style="background:#16a34a"></i>在跑<i style="background:#e0a800"></i>对接中 / 待推广
        <i style="background:#2563eb"></i>开发中<i style="background:#9aa4b2"></i>规划中 / 未上线
      </div>
    </section>

    <section id="cap">
      <h2>平台能力现状</h2>
      <p class="oneliner">平台系统件都已自研在跑，但<strong>能力层很薄</strong>——11 项里只有 4 项在跑，其中结算、风控、履约三项都还没做。</p>
      ${svgCapability()}
    </section>

    <section id="diag">
      <h2>关键诊断 ${diagnosis.confirmed ? badge('已确认') : ''}</h2>
      <p class="oneliner">按 CTO 确认的优先级排序：<strong>结算 &gt; 风控 &gt; 履约</strong>。</p>
      <div class="diag">
        ${diagnosis.items
          .map(
            (d) => `<div class="card"><div class="rank">优先级 ${d.rank}</div><div class="nm">${esc(d.name)}</div>
          <div class="now">现状：${esc(d.now)}</div><div>${md(d.why)}</div></div>`,
          )
          .join('')}
      </div>
    </section>

    <section id="facts">
      <h2>事实清单（CTO 已确认）</h2>
      <table><thead><tr><th style="width:180px">项</th><th>内容</th></tr></thead><tbody>
        ${facts.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${md(v)}</td></tr>`).join('')}
      </tbody></table>
    </section>
  </div>

  <div id="view-block" hidden>
    ${nodes.map(renderPage).join('\n')}
  </div>
</main>
<script>
  function route() {
    var h = decodeURIComponent(location.hash || '');
    var m = h.match(/^#\\/b\\/(.+)$/);
    var ov = document.getElementById('view-overview');
    var vb = document.getElementById('view-block');
    if (m) {
      var want = 'page-' + m[1], found = false;
      document.querySelectorAll('.bpage').forEach(function (p) {
        var on = p.id === want; p.hidden = !on; if (on) found = true;
      });
      ov.hidden = true; vb.hidden = !found;
      if (found) window.scrollTo(0, 0);
    } else {
      ov.hidden = false; vb.hidden = true;
      var anchor = h.replace(/^#\\//, '#');
      if (anchor && anchor !== '#ov') { var el = document.querySelector(anchor); if (el) el.scrollIntoView(); }
    }
  }
  window.addEventListener('hashchange', route);
  document.addEventListener('click', function (e) {
    var g = e.target.closest ? e.target.closest('[data-block]') : null;
    if (g) { location.hash = '#/b/' + encodeURIComponent(g.getAttribute('data-block')); e.preventDefault(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    var g = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-block');
    if (g) location.hash = '#/b/' + encodeURIComponent(g);
  });
  route();
</script>
</body></html>
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, 'utf8');
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`✓ ${path.relative(ROOT, OUT)}  ${kb} KB`);
console.log(`  说明页 ${nodes.length} 个（可点击框同数）· 其中富内容 ${blocks.length} 个 · 子图表 ${Object.keys(L.chains).length} 张`);
console.log(`  全景图：${L.ends.length} 端 · ${L.exits.length} 出口 · ${allBiz.length} 内容 · ${L.suppliers.length} 供给方 · ${L.systems.length} 系统`);

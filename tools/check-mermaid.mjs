#!/usr/bin/env node
// 零依赖 Mermaid 结构校验：subgraph/end 配平、标签引号、ID 引用、classDef 引用。
// 用法: node tools/check-mermaid.mjs <file.md> [more.md ...]
// 退出码: 0 = 全部通过, 1 = 有问题
import fs from 'node:fs';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node tools/check-mermaid.mjs <file.md> [...]');
  process.exit(1);
}

let failed = false;
let blockCount = 0;

for (const file of files) {
  if (!fs.existsSync(file)) {
    console.error(`✗ ${file}: 文件不存在`);
    failed = true;
    continue;
  }
  const doc = fs.readFileSync(file, 'utf8');
  const blocks = [...doc.matchAll(/```mermaid\n([\s\S]*?)\n```/g)].map((m) => m[1]);
  if (!blocks.length) {
    console.log(`· ${file}: 无 mermaid 块`);
    continue;
  }
  for (const [i, block] of blocks.entries()) {
    blockCount++;
    const label = `${file} #${i + 1}`;
    const lines = block.split('\n');
    const fail = (msg) => {
      console.error(`  ✗ ${label}: ${msg}`);
      failed = true;
    };

    // 1. diagram header
    const first = lines.map((l) => l.trim()).find((l) => l && !l.startsWith('%%'));
    if (!/^(flowchart|graph)\s+(TB|TD|BT|LR|RL)$/.test(first)) {
      fail(`diagram header 非法: "${first}"`);
      continue;
    }

    // 2. subgraph / end balance
    let depth = 0;
    let extraEnd = 0;
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith('%%')) continue;
      if (/^subgraph\b/.test(t)) depth++;
      else if (t === 'end') {
        depth--;
        if (depth < 0) extraEnd++;
      }
    }
    if (depth !== 0) fail(`subgraph/end 不配平，未闭合 ${depth} 个`);
    if (extraEnd) fail(`多出 ${extraEnd} 个 end`);

    // 3. declared ids
    const declared = new Set();
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith('%%')) continue;
      const sg = t.match(/^subgraph\s+([A-Za-z0-9_]+)\s*\[/);
      if (sg) {
        declared.add(sg[1]);
        continue;
      }
      for (const m of t.matchAll(/(?:^|\s)([A-Za-z0-9_]+)\s*[[(]/g)) {
        if (!/^(subgraph|flowchart|graph|classDef|class|style|linkStyle|direction)$/.test(m[1])) {
          declared.add(m[1]);
        }
      }
    }

    // 4. edge targets declared
    const referenced = new Set();
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith('%%')) continue;
      if (!/-->|---|==>|-\.->/.test(t)) continue;
      for (const m of t.matchAll(/([A-Za-z0-9_]+)\s*(-{1,3}>|==>|-\.->)/g)) referenced.add(m[1]);
      const tail = t.split(/-{1,3}>|==>|-\.->/).pop().trim();
      if (/^[A-Za-z0-9_]+$/.test(tail)) referenced.add(tail);
    }
    const missing = [...referenced].filter((id) => !declared.has(id));
    if (missing.length) fail(`边引用了未声明的 id: ${missing.join(', ')}`);

    // 5. classDef / class
    const defs = new Set([...block.matchAll(/classDef\s+([A-Za-z0-9_]+)/g)].map((m) => m[1]));
    for (const m of block.matchAll(/^\s*class\s+([^\s]+)\s+([A-Za-z0-9_]+)\s*$/gm)) {
      if (!defs.has(m[2])) fail(`class 用了未定义的 classDef: ${m[2]}`);
      for (const id of m[1].split(',')) {
        if (!declared.has(id)) fail(`class 指向未声明的节点: ${id}`);
      }
    }

    // 6. quoted labels
    for (const line of lines) {
      const stripped = line.replace(/classDef.*/, '').replace(/"[^"]*"/g, '""').trim();
      if (!stripped || stripped.startsWith('%%')) continue;
      if (/\[[^"\]]/.test(stripped)) fail(`节点标签未加引号: ${stripped}`);
    }

    if (!failed) console.log(`  ✓ ${label} (${lines.length} 行, ${declared.size} 节点)`);
  }
}

console.log(
  failed
    ? `\nRESULT: FAIL（检查了 ${blockCount} 个 mermaid 块）`
    : `\nRESULT: PASS（${blockCount} 个 mermaid 块全部通过）`,
);
process.exit(failed ? 1 : 0);

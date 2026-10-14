import fs from 'node:fs';

const ROOT = '/Users/liuchang/Documents/gitproject/jdx_architecture';
const read = f => fs.readFileSync(`${ROOT}/${f}`, 'utf8');
const write = (f, s) => fs.writeFileSync(`${ROOT}/${f}`, s);
const once = (s, marker, label) => {
  const n = s.split(marker).length - 1;
  if (n !== 1) throw new Error(`${label}: 命中 ${n} 次（期望 1）`);
  return s;
};
const insAfter = (s, anchor, text, label) => { once(s, anchor, label); return s.split(anchor).join(anchor + text); };
const insBefore = (s, anchor, text, label) => { once(s, anchor, label); return s.split(anchor).join(text + anchor); };

// ---------- landscape.mjs：合作供给方补回 fintech ----------
let l = read('docs/site/landscape.mjs');
l = insAfter(l,
  "  { name: 'Canlead', sub: '租车（台湾）', tag: '规划', status: '规划中' },\n",
  "  { name: 'fintech', sub: '在线支付 · 收款能力', tag: '合作', status: '在跑' },\n",
  'landscape suppliers');
write('docs/site/landscape.mjs', l);

// ---------- content.mjs：说明页 + 依赖 + 事实清单 ----------
const fintechBlock = `  {
    id: 'page-sup-fintech',
    group: '供给方',
    name: 'fintech',
    badge: '合作 · 在跑',
    oneliner: '支付机构，为 BilionPass 提供在线支付与收款能力。',
    audience: 'BilionPass 各业务与自有端',
    current: [
      '**角色**：支付机构，BilionPass 的在线支付能力与收款能力由其提供。',
      '**边界**：提供的是支付与收款服务能力，不是业务内容供给。'
    ],
    deps: {
      supply: [],
      hub: [],
      distribution: [
        '自有渠道'
      ],
      related: [
        'BilionPass',
        '资金与结算'
      ]
    },
    next: [],
    judgment: [],
    open: [
      '具体接入范围、通道与结算口径。'
    ],
    source: '2026-10-14 用户确认：fintech 是支付机构，BilionPass 的在线支付与收款能力由其提供。'
  },
`;
let c = read('docs/site/content.mjs');
c = insBefore(c, "  {\n    id: 'page-sup-owned',", fintechBlock, 'fintech 说明页插入点');

// 依赖恢复：日本站 / 自有渠道 两个 supply 列表（模式一致，共 2 处）
const pat = "      supply: [\n        '佐川物流'\n      ],";
const n = c.split(pat).length - 1;
if (n !== 2) throw new Error(`supply 模式命中 ${n} 次（期望 2）`);
c = c.split(pat).join("      supply: [\n        '佐川物流',\n        'fintech'\n      ],");
// BilionPass 供给列表补回 fintech
const bil = "      supply: [\n        '佐川物流',\n        'JTR',\n        'Jalan'\n      ],";
once(c, bil, 'BilionPass supply');
c = c.split(bil).join("      supply: [\n        '佐川物流',\n        'JTR',\n        'Jalan',\n        'fintech'\n      ],");
// 事实清单：收款方式后新增
c = insAfter(c,
  "  ['收款方式', 'API 交易：渠道收款后按周期结算给公司；H5 交易：公司页面成交，直接收款。'],\n",
  "  ['在线支付与收款', 'BilionPass 的在线支付能力与收款能力由支付机构 fintech 提供。'],\n",
  'facts 插入点');
write('docs/site/content.mjs', c);

// ---------- architecture.mjs：外部合作方、供给、链路 ----------
let a = read('docs/site/architecture.mjs');
a = insAfter(a,
  "      { name: '转账网关', group: '资金执行', desc: '游客账户出款与结果反馈' },\n",
  "      { name: 'fintech', group: '支付合作', desc: 'BilionPass 在线支付与收款能力' },\n",
  'arch external');
a = insAfter(a,
  "    { name: 'Jalan', status: '对接中', desc: '酒店 API · 已签约', page: 'Jalan' },\n",
  "    { name: 'fintech', status: '在跑', desc: '在线支付与收款能力', page: 'fintech' },\n",
  'arch suppliers');
a = insAfter(a,
  "    { from: '东航 APP', method: '嵌入 H5', to: '空手行系统', state: '已接通', type: 'connected', note: '面向东航会员；我方页面成交', page: '空手行' },\n",
  "    { from: 'BilionPass 自有端', method: '在线支付', to: 'fintech', state: '在跑', type: 'connected', note: 'BilionPass 支付与收款能力由 fintech 提供', page: 'fintech' },\n",
  'arch link');
write('docs/site/architecture.mjs', a);

console.log('✓ fintech 按支付机构口径恢复');

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT_DIR, 'images');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// 单色 SVG 图标生成器（线条风格，81×81 viewport）
function makeSvg(paths, color) {
  // paths: [{d, fill:'none', stroke:color, width:2}, ...]
  const els = paths.map(p => {
    const fill = p.fill || 'none';
    const stroke = p.stroke || color;
    const sw = p.width || 2.5;
    return `<path d="${p.d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }).join('\n  ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="81" height="81" viewBox="0 0 81 81">
  <g transform="translate(8,8) scale(0.8)">
  ${els}
  </g>
</svg>`;
}

// ===== 4 个 Tab 图标路径定义 =====

// 任务（clipboard 剪贴板）
function svgTasks(color) {
  return makeSvg([
    // 板身
    { d: 'M20,10 H60 A6,6 0 0 1 66,16 V62 A6,6 0 0 1 60,68 H20 A6,6 0 0 1 14,62 V16 A6,6 0 0 1 20,10 Z', fill: 'none', stroke: color, width: 3 },
    // 夹子
    { d: 'M30,10 V6 A4,4 0 0 1 34,2 H46 A4,4 0 0 1 50,6 V10', fill: 'none', stroke: color, width: 2.5 },
    // 横线（文字示意）
    { d: 'M24,28 H56', fill: 'none', stroke: color, width: 2 },
    { d: 'M24,38 H48', fill: 'none', stroke: color, width: 2 },
    { d: 'M24,48 H52', fill: 'none', stroke: color, width: 2 },
    { d: 'M24,58 H40', fill: 'none', stroke: color, width: 2 },
  ], color);
}

// 消息（chat bubble 对话气泡）
function svgMessages(color) {
  return makeSvg([
    // 气泡主体
    { d: 'M14,18 H66 A6,6 0 0 1 72,24 V48 A6,6 0 0 1 66,54 H30 L18,66 V54 A6,6 0 0 1 14,48 V24 A6,6 0 0 1 18,18 Z', fill: 'none', stroke: color, width: 3 },
    // 三个点
    { d: 'M30,34 A2,2 0 1 1 30,33.9', fill: color, stroke: 'none', width: 0 },
    { d: 'M42,34 A2,2 0 1 1 42,33.9', fill: color, stroke: 'none', width: 0 },
    { d: 'M54,34 A2,2 0 1 1 54,33.9', fill: color, stroke: 'none', width: 0 },
  ], color);
}

// 考勤（calendar 日历）
function svgDuty(color) {
  return makeSvg([
    // 日历主体
    { d: 'M12,16 H68 A6,6 0 0 1 74,22 V64 A6,6 0 0 1 68,70 H12 A6,6 0 0 1 6,64 V22 A6,6 0 0 1 12,16 Z', fill: 'none', stroke: color, width: 3 },
    // 挂环
    { d: 'M26,16 V10 A3,3 0 0 1 32,7 H36 A3,3 0 0 1 42,10 V16', fill: 'none', stroke: color, width: 2.5 },
    { d: 'M48,16 V10 A3,3 0 0 1 54,7 H58 A3,3 0 0 1 64,10 V16', fill: 'none', stroke: color, width: 2.5 },
    // 横线（日期行）
    { d: 'M6,28 H74', stroke: color, fill: 'none', width: 2.5 },
    // 网格点（示意日期）
    ...[20,34,48,62].flatMap(x => [24,38,52].map(y => 
      ({ d: `M${x},${y} A2,2 0 1 1 ${x},${y-0.1}`, fill: color, stroke: 'none', width: 0 })
    )),
  ], color);
}

// 我的（person 人像）
function svgProfile(color) {
  return makeSvg([
    // 头
    { d: 'M40,22 A14,14 0 1 1 40,21.9', fill: 'none', stroke: color, width: 3 },
    // 身体
    { d: 'M12,68 A28,22 0 0 1 68,68', fill: 'none', stroke: color, width: 3 },
  ], color);
}

const TABS = [
  { name: 'tasks',    fn: svgTasks,    normal: '#9f927d', selected: '#19c8b9' },
  { name: 'messages', fn: svgMessages, normal: '#9f927d', selected: '#19c8b9' },
  { name: 'duty',     fn: svgDuty,     normal: '#9f927d', selected: '#19c8b9' },
  { name: 'profile',  fn: svgProfile,  normal: '#9f927d', selected: '#19c8b9' },
];

async function main() {
  console.log('生成 TabBar 图标 (81×81px PNG)...\n');
  for (const tab of TABS) {
    for (const state of ['normal', 'selected']) {
      const color = state === 'normal' ? tab.normal : tab.selected;
      const suffix = state === 'normal' ? '' : '-active';
      const outPath = path.join(OUT_DIR, `tab-${tab.name}${suffix}.png`);
      const svg = tab.fn(color);

      await sharp(Buffer.from(svg))
        .png()
        .toFile(outPath);

      const label = state === 'normal' ? '普通' : '选中';
      console.log(`  ✅ tab-${tab.name}${suffix}.png (${label}, ${color})`);
    }
  }
  console.log('\n✅ 全部完成！输出:', OUT_DIR);
}

main().catch(err => {
  console.error('❌ 错误:', err.message);
  process.exit(1);
});

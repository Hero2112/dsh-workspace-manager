/* 静态检查：client.js 里的 CSS 是否所有尺寸都乘了 --wm-k。
 * 办法：抽出 CSS 块 → 抹掉所有 calc(Npx * var(--wm-k)) → 剩下还有 px 的就是漏网的。
 */
const fs = require('fs');

const file = process.argv[2];
const source = fs.readFileSync(file, 'utf8');
const start = source.indexOf('const CSS = [');
const end = source.indexOf("].join('');", start);
if (start < 0 || end < 0) {
  console.error('找不到 CSS 块');
  process.exit(2);
}
const block = source.slice(start, end);

// 还原成实际的 CSS 文本：去掉数组引号与逗号、拼接
const cssText = block
  .replace(/^const CSS = \[/, '')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.startsWith("'"))
  .map((line) => line.replace(/^'/, '').replace(/'[,)]?$/, ''))
  .join('');

const scaled = cssText.replace(/calc\([0-9.]+px \* var\(--wm-k\)\)/g, '');
// 线条粗细与拖拽热区故意保持固定像素（缩放它们只会让边框变糊、热区变怪）
const ALLOWED = [/^outline/, /^box-shadow/, /^border/, /^width:6px/, /^width:1px/];
const leftovers = [];
const re = /[^;{]*?[0-9.]+px[^;}]*/g;
let match;
while ((match = re.exec(scaled)) !== null) {
  const snippet = match[0].trim();
  // .5px 是边框，故意保持 1 物理像素，不缩放
  if (/^(border|outline)[^:]*:\s*\.?5?px/.test(snippet)) continue;
  if (ALLOWED.some((pattern) => pattern.test(snippet))) continue;
  leftovers.push(snippet.slice(0, 70));
}

const scaledCount = (cssText.match(/calc\([0-9.]+px \* var\(--wm-k\)\)/g) || []).length;
const borderCount = (cssText.match(/border[^:;]*:\.5px/g) || []).length + (cssText.match(/border-left:\.5px/g) || []).length;

console.log('CSS 块长度: ' + cssText.length + ' 字符');
console.log('已缩放尺寸: ' + scaledCount + ' 处');
console.log('保持 1px 的边框: ' + borderCount + ' 处（.5px，故意不缩放）');
console.log('漏网尺寸: ' + leftovers.length);
for (const item of leftovers) console.log('  LEAK ' + item);

// 三档实际效果换算
const base = [
  ['正文', 13], ['小标题', 12], ['按钮高', 27], ['行高', 30], ['标签', 11], ['大标题', 15],
];
console.log('');
console.log('档位          缩放   正文    按钮高   行高');
for (const [name, k] of [['小 sm', 0.9], ['中 md', 1.08], ['大 lg', 1.38]]) {
  const f = (px) => (px * k).toFixed(1).padStart(6);
  console.log(name.padEnd(12) + k.toFixed(2).padStart(5) + f(13) + f(27) + f(30));
}
process.exit(leftovers.length === 0 ? 0 : 1);

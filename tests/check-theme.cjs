/* 主题对比度检查：用 DSH 主题 token 的真实取值，算出插件在浅色/深色下的文字对比度。
 *
 * 取值来源：app.asar 里的主题定义（alias → static 调色板），已核对：
 *   浅色 bg-base=#fff  layer-1=#fff  layer-2=#fff  brand=#0f1115  text=#0f1115  text2=#61666b  error=#ec1313  warn=#f59e0b
 *   深色 bg-base=#151517 layer-1=#232324 layer-2=#2c2c2e brand=#f9fafb text=#f9fafb text2=#cfd3d6 error=#f25a5a warn=#f59e0b
 * （深色的 brand 是近白色——所以任何「白字压品牌色」都会变成白底白字，这正是 1.3.1 的 bug）
 *
 * 用法：node tests/check-theme.cjs <client.js>
 */
const fs = require('fs');

const file = process.argv[2];
if (!file) { console.error('用法: node tests/check-theme.cjs <client.js>'); process.exit(2); }
const source = fs.readFileSync(file, 'utf8');

// ---------------- 颜色工具
const hex = (value) => {
  let h = value.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const alpha = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: alpha };
};
const over = (top, bottom) => {
  const a = top.a + bottom.a * (1 - top.a);
  const mix = (t, b) => (t * top.a + b * bottom.a * (1 - top.a)) / (a === 0 ? 1 : a);
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a };
};
const luminance = (c) => {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
};
const contrast = (a, b) => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

// ---------------- 主题取值（真实值）
const THEMES = {
  浅色: {
    '--dsw-alias-bg-base': hex('#fff'),
    '--dsw-alias-bg-layer-1': hex('#fff'),
    '--dsw-alias-bg-layer-2': hex('#fff'),
    '--dsw-alias-border-l1': hex('#0000000a'),
    '--dsw-alias-border-l2': hex('#0000001a'),
    '--dsw-alias-brand-primary': hex('#0f1115'),
    '--dsw-alias-label-primary': hex('#0f1115'),
    '--dsw-alias-label-secondary': hex('#61666b'),
    '--dsw-alias-state-error-primary': hex('#ec1313'),
    '--dsw-alias-state-warn-primary': hex('#f59e0b'),
  },
  深色: {
    '--dsw-alias-bg-base': hex('#151517'),
    '--dsw-alias-bg-layer-1': hex('#232324'),
    '--dsw-alias-bg-layer-2': hex('#2c2c2e'),
    '--dsw-alias-border-l1': hex('#ffffff0f'),
    '--dsw-alias-border-l2': hex('#ffffff1f'),
    '--dsw-alias-brand-primary': hex('#f9fafb'),
    '--dsw-alias-label-primary': hex('#f9fafb'),
    '--dsw-alias-label-secondary': hex('#cfd3d6'),
    '--dsw-alias-state-error-primary': hex('#f25a5a'),
    '--dsw-alias-state-warn-primary': hex('#f59e0b'),
  },
};

// ---------------- 从 CSS 里取出 .wm-root 的语义变量定义
const cssStart = source.indexOf('const CSS = [');
const cssEnd = source.indexOf("].join('');", cssStart);
const block = source.slice(cssStart, cssEnd);
const cssText = block.split('\n').map((line) => line.trim())
  .filter((line) => line.startsWith("'"))
  .map((line) => line.replace(/^'/, '').replace(/'[,)]?$/, '')).join('');

const varDefs = [];
const rootStart = cssText.indexOf('.wm-root{');
const rootBody = cssText.slice(rootStart + '.wm-root{'.length, cssText.indexOf('}', rootStart));
const defRe = /--wm-([a-z0-9-]+):([^;]+);/g;
let def;
while ((def = defRe.exec(rootBody)) !== null) {
  const name = '--wm-' + def[1];
  const expr = def[2].trim();
  // --wm-k 是缩放系数（数字），不是颜色，跳过
  if (expr.indexOf('var(') < 0 && expr.indexOf('color-mix(') < 0) continue;
  varDefs.push({ name, expr });
}

const problems = [];
function resolveMap(themeName) {
  const tokens = THEMES[themeName];
  const vars = {};
  for (const { name, expr } of varDefs) {
    if (expr.startsWith('var(')) {
      const inner = expr.slice(4, expr.lastIndexOf(')'));
      const [tokenName, fallback] = inner.split(',').map((part) => part.trim());
      if (tokens[tokenName]) { vars[name] = tokens[tokenName]; continue; }
      if (fallback && fallback !== 'currentColor' && fallback.startsWith('#')) { vars[name] = hex(fallback); continue; }
      vars[name] = tokens['--dsw-alias-label-primary'];
      continue;
    }
    const mix = expr.match(/^color-mix\(in srgb, var\((--wm-[a-z0-9-]+)\) ([0-9.]+)%, transparent\)$/);
    if (mix) {
      const base = vars[mix[1]];
      if (!base) { problems.push(`${themeName}: ${name} 引用了未定义或顺序不对的 ${mix[1]}`); vars[name] = hex('#000'); continue; }
      vars[name] = { r: base.r, g: base.g, b: base.b, a: (base.a === undefined ? 1 : base.a) * (parseFloat(mix[2]) / 100) };
      continue;
    }
    // 两种颜色混合（例如「危险色 70% + 主文字色 30%」）
    const blend = expr.match(/^color-mix\(in srgb, var\((--wm-[a-z0-9-]+)\) ([0-9.]+)%, var\((--wm-[a-z0-9-]+)\)\)$/);
    if (blend) {
      const first = vars[blend[1]];
      const second = vars[blend[3]];
      if (!first || !second) { problems.push(`${themeName}: ${name} 混色引用了未定义的变量`); vars[name] = hex('#000'); continue; }
      const p = parseFloat(blend[2]) / 100;
      vars[name] = {
        r: first.r * p + second.r * (1 - p),
        g: first.g * p + second.g * (1 - p),
        b: first.b * p + second.b * (1 - p),
        a: 1,
      };
      continue;
    }
    problems.push(`${themeName}: 无法解析 ${name} = ${expr}`);
    vars[name] = hex('#000');
  }
  return { vars, tokens };
}

const rows = [];
const check = (themeName, label, fg, bg, threshold) => {
  const ratio = contrast(fg, bg);
  rows.push({ themeName, label, ratio, threshold, ok: ratio >= threshold });
};

for (const themeName of Object.keys(THEMES)) {
  const { vars, tokens } = resolveMap(themeName);
  const base = tokens['--dsw-alias-bg-base'];
  const surface = vars['--wm-surface'] || base;
  const surface2 = vars['--wm-surface-2'] || base;
  const text = vars['--wm-text'];
  const dim = over(vars['--wm-text-dim'], surface);
  const accent = vars['--wm-accent'];
  const accentSoft = over(vars['--wm-accent-soft'], surface);
  const danger = vars['--wm-danger-text'] || vars['--wm-danger'];
  const dangerSoft = over(vars['--wm-danger-soft'], surface);
  const warnSoft = over(vars['--wm-warn-soft'], surface);
  const hover = over(vars['--wm-hover'], surface);

  check(themeName, '正文 on 背景', text, base, 4.5);
  check(themeName, '正文 on 卡片/左栏', text, surface, 4.5);
  check(themeName, '次要文字 on 卡片', dim, surface, 4.5);
  check(themeName, '主按钮文字（强调色 on 淡底）', accent, accentSoft, 4.5);
  check(themeName, '危险按钮文字 on 淡底', danger, dangerSoft, 4.5);
  check(themeName, '提示条正文 on 警告淡底', text, warnSoft, 4.5);
  check(themeName, '徽标文字 on 徽标底', dim, over(vars['--wm-hover'], surface), 4.5);

  // hover / 选中：不要求对比度，只要求肉眼可分辨（亮度差）
  const delta = Math.abs(luminance(hover) - luminance(surface));
  rows.push({ themeName, label: 'hover 底色可见（亮度差）', ratio: delta * 100, threshold: 0.8, ok: delta >= 0.008, raw: true });

  // 旧写法（1.3.1）的对照：白字压品牌色
  const oldRatio = contrast(hex('#fff'), vars['--wm-accent']);
  rows.push({ themeName, label: '【旧写法】白字压品牌色', ratio: oldRatio, threshold: 4.5, ok: oldRatio >= 4.5, legacy: true });
}

// 输出
let failed = 0;

// 额外守卫：CSS 里不允许出现写死的颜色（var() 的兜底值可以）
const withoutVar = cssText.replace(/var\([^)]*\)/g, '');
const hardcoded = withoutVar.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
if (hardcoded.length > 0) {
  console.log('写死的颜色（应改为 var(--wm-*)）：' + JSON.stringify(hardcoded));
  failed += hardcoded.length;
}

for (const theme of Object.keys(THEMES)) {
  console.log(`\n===== ${theme} =====`);
  for (const row of rows.filter((r) => r.themeName === theme)) {
    const value = row.raw ? `Δ${row.ratio.toFixed(1)}` : `${row.ratio.toFixed(2)}:1`;
    const mark = row.legacy ? (row.ok ? 'PASS' : '对照') : (row.ok ? 'PASS' : 'FAIL');
    if (!row.ok && !row.legacy) failed++;
    console.log(`  ${mark}  ${row.label.padEnd(24)} ${value.padStart(9)}  (阈值 ${row.raw ? row.threshold : row.threshold + ':1'})`);
  }
}
if (problems.length > 0) {
  console.log('\n解析问题：');
  problems.forEach((p) => console.log('  ' + p));
}
console.log(`\n对比度检查：${failed === 0 && problems.length === 0 ? '全部通过' : failed + ' 项不达标'}`);
process.exit(failed === 0 && problems.length === 0 ? 0 : 1);

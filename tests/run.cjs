/* Behavioural smoke test for the workspace-manager client half.
 * Runs the real client.js in a Node vm with a tiny hook runtime + fake Host
 * services, drives the real UI handlers, and asserts real stored state.
 * Usage: node run.cjs <path-to-client.js>
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const target = process.argv[2];
if (!target) { console.error('usage: node run.cjs <client.js>'); process.exit(2); }
const source = fs.readFileSync(target, 'utf8');

const hookSlots = [];
let slotIndex = 0;
let rendering = false;
let pendingRender = false;
let render = () => {};

const sameDeps = (a, b) => {
  if (a === undefined || b === undefined || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
};
const schedule = () => { if (rendering) pendingRender = true; else render(); };

const React = {
  createElement(type, props) {
    const children = [];
    for (let i = 2; i < arguments.length; i++) {
      const child = arguments[i];
      if (Array.isArray(child)) children.push(...child.flat(Infinity));
      else if (child === null || child === undefined || child === false) continue;
      else children.push(child);
    }
    return { type, props: props == null ? {} : props, children };
  },
  useState(initial) {
    const index = slotIndex++;
    if (hookSlots.length <= index) hookSlots.push({ value: typeof initial === 'function' ? initial() : initial });
    const cell = hookSlots[index];
    const set = (next) => {
      const value = typeof next === 'function' ? next(cell.value) : next;
      if (Object.is(value, cell.value)) return;
      cell.value = value;
      schedule();
    };
    return [cell.value, set];
  },
  useRef(initial) {
    const index = slotIndex++;
    if (hookSlots.length <= index) hookSlots.push({ ref: { current: initial } });
    return hookSlots[index].ref;
  },
  useMemo(factory, deps) {
    const index = slotIndex++;
    if (hookSlots.length <= index) hookSlots.push({ deps: undefined, value: undefined });
    const cell = hookSlots[index];
    if (!sameDeps(cell.deps, deps)) { cell.value = factory(); cell.deps = deps; }
    return cell.value;
  },
  useEffect(fn, deps) {
    const index = slotIndex++;
    if (hookSlots.length <= index) hookSlots.push({ deps: undefined });
    const cell = hookSlots[index];
    if (!sameDeps(cell.deps, deps)) { cell.deps = deps; cell.effect = fn; }
  },
};

const storage = new Map();
const listeners = [];
let moduleRegistration = null;
const win = {
  __ModuleLoader__: { load: (registration) => { moduleRegistration = registration; } },
  localStorage: {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  },
  setTimeout: () => 0,
  clearTimeout: () => {},
  addEventListener: (type, fn) => listeners.push({ type, fn }),
  removeEventListener: () => {},
};

const calls = { openSession: [], connectWorkspace: [], archiveSession: [], unarchiveSession: [], selectPanel: [], create: [] };
const snap = (value) => ({ getSnapshot: () => value, subscribe: () => () => {} });
const workspaceSnapshot = {
  items: [{ workspaceId: 'ws1', title: '项目一', path: 'F:\\demo', sessionIds: ['s1', 's2', 's3', 's4'] }],
  archivedSessionIds: ['s4'],
  state: 'ready',
};
const sessionById = {
  s1: { id: 's1', title: '开题报告' },
  s2: { id: 's2', title: '数据分析' },
  s3: { id: 's3', title: '周报' },
  s4: { id: 's4', title: '旧讨论' },
};
const registrations = [];
const ctx = {
  effect: (fn) => { fn(); },
  locale: { register: () => {}, getLocale: () => ({ id: 'zh-CN' }) },
  slots: { inject: (name, fn) => fn(), register: (options, component) => { registrations.push({ options, component }); return () => {}; } },
  workspaces: { list: snap(workspaceSnapshot), create: async (input) => calls.create.push(input) },
  sessions: { list: snap({ ids: Object.keys(sessionById), byId: sessionById }) },
  uiWorkspace: {
    openSession: (id) => calls.openSession.push(id),
    connectWorkspace: async (id) => { calls.connectWorkspace.push(id); return 'new-session'; },
    archiveSession: async (id) => { calls.archiveSession.push(id); },
    unarchiveSession: async (id) => { calls.unarchiveSession.push(id); },
    pickDirectory: async () => 'F:\\picked',
  },
  layout: { selectPanel: (id) => calls.selectPanel.push(id) },
};

let tree = null;
function expand(node) {
  if (node === null || node === undefined) return node;
  if (typeof node === 'string' || typeof node === 'number') return node;
  if (Array.isArray(node)) return node.map(expand);
  if (typeof node !== 'object' || node.type === undefined) return node;
  if (typeof node.type === 'function') {
    slotIndex = 0;
    const out = node.type({ ...node.props, children: node.children });
    const effects = [];
    for (let i = 0; i < slotIndex; i++) {
      const cell = hookSlots[i];
      if (cell && typeof cell.effect === 'function') effects.push(cell);
    }
    for (const cell of effects) { const fn = cell.effect; cell.effect = undefined; fn(); }
    return expand(out);
  }
  return { type: node.type, props: node.props, children: node.children.map(expand) };
}
function walk(node, visit) {
  if (node === null || node === undefined || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach((child) => walk(child, visit)); return; }
  visit(node);
  if (node.children) node.children.forEach((child) => walk(child, visit));
}
const findAll = (predicate) => { const out = []; walk(tree, (node) => { if (predicate(node)) out.push(node); }); return out; };
function textOf(node) {
  const parts = [];
  walk(node, (current) => {
    if (current && typeof current === 'object' && current.children) {
      for (const child of current.children) if (typeof child === 'string') parts.push(child);
    }
  });
  return parts.join('');
}
const evt = (value) => ({ preventDefault() {}, stopPropagation() {}, target: { value: value === undefined ? '' : value, blur() {} }, dataTransfer: { setData() {}, effectAllowed: '' } });
function click(node) {
  if (!node || !node.props || typeof node.props.onClick !== 'function') throw new Error('not clickable');
  node.props.onClick(evt());
}
function clickText(label) {
  const hits = findAll((node) => node.props && typeof node.props.onClick === 'function' && textOf(node) === label);
  if (hits.length === 0) throw new Error('no clickable "' + label + '" — have: ' + JSON.stringify(findAll((n) => n.props && typeof n.props.onClick === 'function').map(textOf).slice(0, 40)));
  click(hits[hits.length - 1]);
}

const sandbox = { window: win, console, JSON, Date, Math, Object, Array, String, Number, Boolean, Set, Map, Error };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: path.basename(target) });
if (!moduleRegistration) { console.error('FAIL: no module registration'); process.exit(1); }

const mod = moduleRegistration.factory((name) => {
  if (name === 'react') return React;
  throw new Error('unexpected require: ' + name);
});
for (const key of mod.inject) if (ctx[key] === undefined) throw new Error('missing service: ' + key);
mod.apply(ctx);

const mainReg = registrations.find((entry) => entry.options.name === 'main');
const panelReg = registrations.find((entry) => entry.options.name === 'sidebar.panellist');

render = () => {
  let guard = 0;
  do {
    pendingRender = false;
    rendering = true;
    tree = expand(React.createElement(mainReg.component, mainReg.options.inject()));
    rendering = false;
  } while (pendingRender && ++guard < 500);
};

let pass = 0;
const failures = [];
const check = (name, condition, detail) => {
  if (condition) { pass++; return; }
  failures.push(name + (detail === undefined ? '' : ' — ' + detail));
};
const storeOf = () => JSON.parse(storage.get('dsh.workspace-manager.v2'));
const foldersOf = () => storeOf().projects.ws1.folders;
const folderById = (id) => foldersOf().find((folder) => folder.id === id) || null;
const rowsNow = () => findAll((node) => node.props && typeof node.props.className === 'string'
  && node.props.className.split(' ').indexOf('wm-row') >= 0);
const rowByName = (name) => {
  const rows = rowsNow().filter((row) => textOf(row).indexOf(name) >= 0);
  return rows[rows.length - 1];
};
const manageRow = (folderId) => {
  const hits = findAll((node) => node.props && node.props.key === 'g|ws1|' + folderId);
  if (hits.length === 0) {
    throw new Error('no manage row for ' + folderId + ' | keys: ' + JSON.stringify(findAll(
      (node) => node.props && typeof node.props.key === 'string' && node.props.key.charAt(0) === 'g',
    ).map((node) => node.props.key)));
  }
  return hits[0];
};
const inManage = (folderId, predicate) => {
  const hits = [];
  walk(manageRow(folderId), (node) => { if (predicate(node)) hits.push(node); });
  return hits;
};

storage.set('dsh.workspace-manager.v2', JSON.stringify({
  version: 2,
  projects: {
    ws1: {
      folders: [
        { id: 'fA', name: '论文', parentId: null, color: 1, icon: '', pinned: false },
        { id: 'fB', name: '数据', parentId: 'fA', color: 0, icon: '', pinned: false },
        { id: 'fC', name: '空分类', parentId: null, color: 0, icon: '', pinned: false },
      ],
      assignments: { s1: 'fA', s2: 'fB' },
    },
  },
  prefs: { sort: 'recent', activeKind: 'project', activeProjectId: 'ws1', manage: false },
}));
render();

check('module id', moduleRegistration.id === '@local/workspace-manager');
check('sidebar registration', panelReg.options.id === 'workspace-manager' && panelReg.options.order === 20);
check('panel icon renders', panelReg.component({ size: 18, active: false }) !== null);
check('tree view baseline', findAll((n) => n.props && String(n.props.className || '').indexOf('wm-name-folder') >= 0).length === 3,
  JSON.stringify(rowsNow().map(textOf)));

// 左栏两项的文案：待归类 / 归档区（不再是"收件箱"）
const navLabels = findAll((n) => n.props && typeof n.props.className === 'string'
  && n.props.className.indexOf('wm-navit') >= 0).map(textOf);
check('左栏第一项叫「待归类」', navLabels.some((label) => label.indexOf('待归类') === 0), JSON.stringify(navLabels));
check('左栏第二项叫「归档区」', navLabels.some((label) => label.indexOf('归档区') === 0), JSON.stringify(navLabels));
check('不再出现「收件箱」', navLabels.every((label) => label.indexOf('收件箱') < 0), JSON.stringify(navLabels));

// 分类行：点分类名 / 数字都能收起或展开里面的对话
const inNode = (node, predicate) => {
  const hits = [];
  walk(node, (n) => { if (predicate(n)) hits.push(n); });
  return hits;
};
const folderRowOf = (id) => findAll((node) => node.props && node.props.key === 'f|ws1|' + id)[0];
const sessionRowsOf = (title) => findAll((node) => node.props && typeof node.props.className === 'string'
  && node.props.className.split(' ').indexOf('wm-row') >= 0 && textOf(node).indexOf(title) >= 0);
check('分类里能看到它下面的对话', sessionRowsOf('开题报告').length === 1, JSON.stringify(rowsNow().map(textOf)));
const nameToggle = inNode(folderRowOf('fA'), (n) => n.props
  && String(n.props.className || '').indexOf('wm-name-toggle') >= 0)[0];
check('分类名是可点的展开开关', Boolean(nameToggle));
click(nameToggle);
render();
check('收起后看不到里面的对话', sessionRowsOf('开题报告').length === 0);
click(nameToggle);
render();
check('再点一下又展开了', sessionRowsOf('开题报告').length === 1);
const countBadge = inNode(folderRowOf('fA'), (n) => n.props
  && String(n.props.className || '').indexOf('wm-badge-btn') >= 0)[0];
check('数字徽标也可点', Boolean(countBadge));
click(countBadge);
render();
check('点数字也能收起', sessionRowsOf('开题报告').length === 0);
click(countBadge);
render();

clickText('管理分类');
render();
check('manage preference stored', storeOf().prefs.manage === true);
const classes = rowsNow().map((node) => node.props.className);
check('manage head row', classes.some((name) => name.indexOf('wm-mhead') >= 0), JSON.stringify(classes));
check('manage lists folders', findAll((node) => node.props && typeof node.props.key === 'string'
  && node.props.key.indexOf('g|ws1|') === 0).length === 3,
  JSON.stringify(classes));
check('manage indents children', findAll((n) => n.props && n.props.style && n.props.style.paddingLeft === 22).length >= 1);
check('manage has clean-empty', findAll((n) => n.props && textOf(n) === '清理空分类').length >= 1);

// rename via name link
const link = inManage('fA', (n) => n.props && String(n.props.className || '').indexOf('wm-name-link') >= 0)[0];
check('name is a link', Boolean(link));
click(link);
render();
const editor = findAll((n) => n.props && n.props.className === 'wm-input' && typeof n.props.onChange === 'function');
check('rename editor opens', editor.length === 1, 'editors=' + editor.length);
editor[0].props.onChange(evt('论文二'));
render();
clickText('确定');
render();
check('rename persisted', folderById('fA').name === '论文二', JSON.stringify(folderById('fA')));

// parent picker guards against cycles
const parentPickers = findAll((n) => n.type === 'select' && n.props && String(n.props.className || '').indexOf('wm-select-parent') >= 0);
check('parent picker per folder', parentPickers.length === 3, 'found=' + parentPickers.length);
const pickerA = parentPickers.find((n) => n.props.value === '__none__');
const values = [];
walk(pickerA, (n) => { if (n.type === 'option') values.push(n.props.value); });
check('picker hides own subtree', values.indexOf('fA') < 0 && values.indexOf('fB') < 0, JSON.stringify(values));
check('picker offers other roots', values.indexOf('fC') >= 0, JSON.stringify(values));

// re-parent 空分类 under 论文二
const pickerC = parentPickers[2];
check('third picker is 空分类', pickerC !== undefined);
pickerC.props.onChange(evt('fA'));
render();
check('re-parent persisted', folderById('fC').parentId === 'fA', JSON.stringify(folderById('fC')));

// reorder before pinning (pinned folders sort to the top, which would mask the swap)
click(inManage('fC', (n) => n.props && n.props.title === '上移')[0]);
render();
check('reorder persisted', foldersOf().map((f) => f.id).indexOf('fC') < foldersOf().map((f) => f.id).indexOf('fB'),
  JSON.stringify(foldersOf().map((f) => f.id)));

// pin / icon on 空分类
click(inManage('fC', (n) => n.props && n.props.title === '置顶')[0]);
render();
check('pin persisted', folderById('fC').pinned === true, JSON.stringify(folderById('fC')));
click(inManage('fC', (n) => n.props && n.props.title === '选择图标' && typeof n.props.onClick === 'function')[0]);
render();
check('icon picker opens', findAll((n) => n.props && String(n.props.className || '') === 'wm-icons').length === 1);
click(findAll((n) => n.props && n.props.title === '📝' && typeof n.props.onClick === 'function')[0]);
render();
check('icon persisted', folderById('fC').icon === '📝', JSON.stringify(folderById('fC')));

// merge 数据 into 论文二
click(inManage('fB', (n) => n.props && n.props.title === '合并到' && typeof n.props.onClick === 'function')[0]);
render();
const pickers = findAll((n) => n.type === 'select' && n.props && n.props.title === '合并到');
check('merge picker opens', pickers.length === 1, 'found=' + pickers.length);
pickers[0].props.onChange(evt('fA'));
render();
check('merged folder removed', folderById('fB') === null, JSON.stringify(foldersOf().map((f) => f.id)));
check('merged conversation moved', storeOf().projects.ws1.assignments.s2 === 'fA', JSON.stringify(storeOf().projects.ws1.assignments));
check('merge notice', findAll((n) => n.props && textOf(n) === '已合并到「论文二」').length === 1);
clickText('撤销');
render();
check('undo restores folder', folderById('fB') !== null, JSON.stringify(foldersOf().map((f) => f.id)));
check('undo restores assignment', storeOf().projects.ws1.assignments.s2 === 'fB');

// clean empty
clickText('清理空分类');
render();
check('clean removes empties', foldersOf().map((f) => f.id).indexOf('fC') < 0, JSON.stringify(foldersOf().map((f) => f.id)));
check('clean keeps used', folderById('fA') !== null && folderById('fB') !== null);
check('clean notice', findAll((n) => n.props && textOf(n) === '已清理 1 个空分类').length === 1);
check('clean undo banner', findAll((n) => n.props && textOf(n) === '撤销').length === 1);

// delete needs two clicks
const before = foldersOf().length;
const del = () => inManage('fB', (n) => n.props && (n.props.title === '删除' || n.props.title === '再点一次确认删除'))[0];
click(del());
render();
check('first delete click arms', foldersOf().length === before);
click(del());
render();
check('second delete click deletes', foldersOf().length === before - 1, JSON.stringify(foldersOf().map((f) => f.id)));

// back to tree view
clickText('回到对话');
render();
check('manage preference cleared', storeOf().prefs.manage === false);
check('tree view returns', findAll((n) => n.props && String(n.props.className || '').indexOf('wm-name-folder') >= 0).length >= 1);
check('keyboard listener installed', listeners.some((entry) => entry.type === 'keydown'));

// ---- 界面大小三档 + 左栏可拖拽（v1.3.0）
const rootNode = () => findAll((node) => node.props && node.props.className === 'wm-root')[0];
const splitNode = () => findAll((node) => node.props && String(node.props.className || '').indexOf('wm-split') >= 0)[0];
const navNode = () => findAll((node) => node.props && node.props.className === 'wm-nav')[0];
const scaleButtons = () => findAll((node) => node.props && typeof node.props.className === 'string'
  && node.props.className.indexOf('wm-scalebtn') >= 0);
const scaleButton = (label) => scaleButtons().find((node) => textOf(node) === label);
const capture = () => ({ setPointerCapture() {}, releasePointerCapture() {} });

check('scale defaults to medium', rootNode().props.style['--wm-k'] === '1.08', JSON.stringify(rootNode().props.style));
check('three scale buttons visible', scaleButtons().length === 3, 'found=' + scaleButtons().length);
check('medium is the active button', scaleButton('中').props.className.indexOf('wm-scalebtn-active') >= 0,
  scaleButton('中').props.className);
check('nav width starts at 224 * k', navNode().props.style.width === Math.round(224 * 1.08) + 'px', navNode().props.style.width);

click(scaleButton('大'));
render();
check('scale preference stored', storeOf().prefs.scale === 'lg', JSON.stringify(storeOf().prefs.scale));
check('scale reaches root style', rootNode().props.style['--wm-k'] === '1.38', JSON.stringify(rootNode().props.style));
check('large becomes the active button', scaleButton('大').props.className.indexOf('wm-scalebtn-active') >= 0);
check('nav grows with scale', navNode().props.style.width === Math.round(224 * 1.38) + 'px', navNode().props.style.width);

// 拖拽：起点 300，右移 60 视觉像素 → 基准宽度增加 60 / 1.38
const navStart = storeOf().prefs.navWidth;
splitNode().props.onPointerDown({ preventDefault() {}, clientX: 300, pointerId: 1, currentTarget: capture() });
render();
check('dragging activates divider', findAll((n) => n.props && String(n.props.className || '').indexOf('wm-split-active') >= 0).length === 1);
splitNode().props.onPointerMove({ clientX: 360, pointerId: 1, currentTarget: capture() });
render();
check('drag previews a wider column', parseInt(navNode().props.style.width, 10) > Math.round(navStart * 1.38),
  navNode().props.style.width);
check('drag does not write storage yet', storeOf().prefs.navWidth === navStart, String(storeOf().prefs.navWidth));
splitNode().props.onPointerUp({ clientX: 360, pointerId: 1, currentTarget: capture() });
render();
check('drag commits the width', storeOf().prefs.navWidth === navStart + Math.round(60 / 1.38),
  storeOf().prefs.navWidth + ' (start ' + navStart + ')');
check('divider leaves dragging state', findAll((n) => n.props && String(n.props.className || '').indexOf('wm-split-active') >= 0).length === 0);

// 键盘调宽 + 双击复位
const beforeKey = storeOf().prefs.navWidth;
splitNode().props.onKeyDown({ key: 'ArrowRight', preventDefault() {}, stopPropagation() {} });
render();
check('keyboard widens the column', storeOf().prefs.navWidth > beforeKey, beforeKey + ' -> ' + storeOf().prefs.navWidth);
splitNode().props.onDoubleClick();
render();
check('double click resets the width', storeOf().prefs.navWidth === 224, String(storeOf().prefs.navWidth));

check('nav item tooltip carries the full path', findAll((node) => node.props
  && String(node.props.className || '').indexOf('wm-navit') >= 0
  && typeof node.props.title === 'string' && node.props.title.indexOf('\n') >= 0).length >= 1);

// ---- 分类管理里的「查看」：跳回对话视图并展开该分类
clickText('管理分类');
render();
const viewBtn = inNode(manageRow('fA'), (n) => n.props
  && n.props.title === '查看这个分类里的对话' && typeof n.props.onClick === 'function')[0];
check('管理表里有「查看」按钮', Boolean(viewBtn));
click(viewBtn);
render();
check('查看后切回对话视图', storeOf().prefs.manage === false);
check('查看后落在该分类那一行', findAll((node) => node.props
  && node.props['data-nav-key'] === 'f|ws1|fA').length === 1);
check('查看后该分类是展开的', sessionRowsOf('开题报告').length === 1);


// ---- legacy v1 store still migrates (fresh mount)
hookSlots.length = 0;
storage.clear();
storage.set('dsh.workspace-manager.v1', JSON.stringify({
  version: 1,
  projects: { ws1: { folders: [{ id: 'x1', name: '旧文件夹' }], assignments: { s1: 'x1' } } },
  prefs: { sort: 'title' },
}));
render();
check('legacy folder survives migration', findAll((node) => node.props
  && String(node.props.className || '').indexOf('wm-name-folder') >= 0 && textOf(node) === '旧文件夹').length === 1,
  JSON.stringify(rowsNow().map(textOf)));
check('legacy prefs survive migration', JSON.parse(storage.get('dsh.workspace-manager.v2')).prefs.sort === 'title');
check('legacy data rewritten as v2', JSON.parse(storage.get('dsh.workspace-manager.v2')).version === 2);

console.log('');
console.log('passed: ' + pass + '  failed: ' + failures.length);
for (const failure of failures) console.log('  FAIL ' + failure);
process.exit(failures.length === 0 ? 0 : 1);

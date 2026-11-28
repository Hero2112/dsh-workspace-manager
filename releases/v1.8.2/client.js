/**
 * 工作区管理 —— Client 半（v2 数据结构）。
 *
 * 在主区域提供一页管理界面，入口是注册在同一 id 下的侧边栏面板图标。
 * 每个 Workspace 就是一个「项目」；每个项目拥有用户自建的分类树，
 * 对话则被归类到这些分类里。
 *
 * 本模块内实现的能力：
 *  - 双栏布局：左侧项目导航，右侧内容行
 *  - 拖拽：对话拖进分类，分类拖进分类或拖回根目录
 *  - 批量操作：一次归类或归档多条对话
 *  - 分类的颜色与 emoji、置顶、同级排序、排序方式
 *  - 跨项目的「待归类」汇总，以及带恢复能力的归档列表
 *  - 删除分类的撤销，键盘导航与快捷键
 *  - 分类管理视图：平铺表格集中管理全部分类（改名、换上级、合并、清理空分类）
 *
 * 分类树、归类关系和视图偏好属于插件自己的界面数据，因此存放在本浏览器的
 * localStorage 里，用带版本号的键区分代次。工作区与对话数据以 Host 为准：
 * 只从实时服务快照读取，所有写操作都走官方 Workspace 服务。
 */

window.__ModuleLoader__.load({
  id: '@local/workspace-manager',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'workspaceManager';
    const PANEL_ID = 'workspace-manager';
    // 右侧栏那个常驻标签页（打开对话也不会被关掉）
    const PANE_ID = '@local/workspace-manager';
    const PANE_KIND = 'workspace-manager';
    const STORE_KEY = 'dsh.workspace-manager.v2';
    const LEGACY_KEY = 'dsh.workspace-manager.v1';
    const UNCATEGORIZED = '__none__';

    /** 用户选的颜色只是装饰，所以直接写字面值，不套主题 token。 */
    // 调色板：索引 0 = 不染色；1-7 是最早那 7 个（老数据的索引不能变），后面是 1.6.5 追加的 21 个。
    const PALETTE = [
      '',
      '#8A8F98', '#1F6FEB', '#2E9E5B', '#D99A2B', '#D9534F', '#8B5CF6', '#E05A9E',
      '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16', '#22C55E', '#14B8A6',
      '#06B6D4', '#0EA5E9', '#3B82F6', '#6366F1', '#A855F7', '#D946EF', '#EC4899',
      '#64748B', '#78716C', '#B45309', '#15803D', '#1D4ED8', '#7E22CE', '#0F766E',
    ];
    /**
     * 分类图标：全部是 Unicode emoji——不用打包任何图片资源，免费可商用，任何系统都能显示。
     * 按用途分组，省得一长串里找不着。
     */
    /**
     * 线性图标：来自 Lucide（ISC 许可，见 THIRD-PARTY-LICENSES.md），内联成 SVG，不加载外部图片。
     * folder.icon 里存 "svg:<name>"；老数据是 emoji，两种都能显示。
     */
    const SVG_ICONS = {
      'life-buoy': '<circle cx="12" cy="12" r="10" /> <path d="m4.93 4.93 4.24 4.24" /> <path d="m14.83 9.17 4.24-4.24" /> <path d="m14.83 14.83 4.24 4.24" /> <path d="m9.17 14.83-4.24 4.24" /> <circle cx="12" cy="12" r="4" />',
      'rotate-ccw': '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /> <path d="M3 3v5h5" />',
      'credit-card': '<rect width="20" height="14" x="2" y="5" rx="2" /> <line x1="2" x2="22" y1="10" y2="10" />',
      'user-check': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /> <circle cx="9" cy="7" r="4" /> <polyline points="16 11 18 13 22 9" />',
      'users': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /> <circle cx="9" cy="7" r="4" /> <path d="M22 21v-2a4 4 0 0 0-3-3.87" /> <path d="M16 3.13a4 4 0 0 1 0 7.75" />',
      'shopping-bag': '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /> <path d="M3 6h18" /> <path d="M16 10a4 4 0 0 1-8 0" />',
      'tags': '<path d="m15 5 6.3 6.3a2.4 2.4 0 0 1 0 3.4L17 19" /> <path d="M9.586 5.586A2 2 0 0 0 8.172 5H3a1 1 0 0 0-1 1v5.172a2 2 0 0 0 .586 1.414L8.29 18.29a2.426 2.426 0 0 0 3.42 0l3.58-3.58a2.426 2.426 0 0 0 0-3.42z" /> <circle cx="6.5" cy="9.5" r=".5" fill="currentColor" />',
      'at-sign': '<circle cx="12" cy="12" r="4" /> <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" />',
      'filter': '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />',
      'link': '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /> <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />',
      'calendar': '<path d="M8 2v4" /> <path d="M16 2v4" /> <rect width="18" height="18" x="3" y="4" rx="2" /> <path d="M3 10h18" />',
      'magnet': '<path d="m6 15-4-4 6.75-6.77a7.79 7.79 0 0 1 11 11L13 22l-4-4 6.39-6.36a2.14 2.14 0 0 0-3-3L6 15" /> <path d="m5 8 4 4" /> <path d="m12 15 4 4" />',
      'chart-pie': '<path d="M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.998.398-.998.95v8a1 1 0 0 0 1 1z" /> <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />',
      'flame': '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />',
      'upload': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /> <polyline points="17 8 12 3 7 8" /> <line x1="12" x2="12" y1="3" y2="15" />',
      'gift': '<rect x="3" y="8" width="18" height="4" rx="1" /> <path d="M12 8v13" /> <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /> <path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" />',
      'video': '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" /> <rect x="2" y="6" width="14" height="12" rx="2" />',
      'cast': '<path d="M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6" /> <path d="M2 12a9 9 0 0 1 8 8" /> <path d="M2 16a5 5 0 0 1 4 4" /> <line x1="2" x2="2.01" y1="20" y2="20" />',
      'radio': '<path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" /> <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" /> <circle cx="12" cy="12" r="2" /> <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" /> <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19" />',
      'megaphone': '<path d="m3 11 18-5v12L3 14v-3z" /> <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />',
      'package': '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" /> <path d="M12 22V12" /> <path d="m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7" /> <path d="m7.5 4.27 9 5.15" />',
      'music': '<path d="M9 18V5l12-2v13" /> <circle cx="6" cy="18" r="3" /> <circle cx="18" cy="16" r="3" />',
      'package-check': '<path d="m16 16 2 2 4-4" /> <path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14" /> <path d="m7.5 4.27 9 5.15" /> <polyline points="3.29 7 12 12 20.71 7" /> <line x1="12" x2="12" y1="22" y2="12" />',
      'list-checks': '<path d="m3 17 2 2 4-4" /> <path d="m3 7 2 2 4-4" /> <path d="M13 6h8" /> <path d="M13 12h8" /> <path d="M13 18h8" />',
      'bell': '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /> <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />',
      'globe': '<circle cx="12" cy="12" r="10" /> <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /> <path d="M2 12h20" />',
      'check-circle': '<circle cx="12" cy="12" r="10" /> <path d="m9 12 2 2 4-4" />',
      'store': '<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7" /> <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /> <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4" /> <path d="M2 7h20" /> <path d="M22 7v3a2 2 0 0 1-2 2a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12a2 2 0 0 1-2-2V7" />',
      'play': '<polygon points="6 3 20 12 6 21 6 3" />',
      'images': '<path d="M18 22H4a2 2 0 0 1-2-2V6" /> <path d="m22 13-1.296-1.296a2.41 2.41 0 0 0-3.408 0L11 18" /> <circle cx="12" cy="8" r="2" /> <rect width="16" height="16" x="6" y="2" rx="2" />',
      'chart-line': '<path d="M3 3v16a2 2 0 0 0 2 2h16" /> <path d="m19 9-5 5-4-4-3 3" />',
      'clapperboard': '<path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z" /> <path d="m6.2 5.3 3.1 3.9" /> <path d="m12.4 3.4 3.1 4" /> <path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />',
      'clock': '<circle cx="12" cy="12" r="10" /> <polyline points="12 6 12 12 16 14" />',
      'image': '<rect width="18" height="18" x="3" y="3" rx="2" ry="2" /> <circle cx="9" cy="9" r="2" /> <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />',
      'folder-open': '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />',
      'timer': '<line x1="10" x2="14" y1="2" y2="2" /> <line x1="12" x2="15" y1="14" y2="11" /> <circle cx="12" cy="14" r="8" />',
      'star': '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />',
      'alert-circle': '<circle cx="12" cy="12" r="10" /> <line x1="12" x2="12" y1="8" y2="12" /> <line x1="12" x2="12.01" y1="16" y2="16" />',
      'message-square': '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />',
      'folder': '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />',
      'tag': '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" /> <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />',
      'trophy': '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /> <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /> <path d="M4 22h16" /> <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /> <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /> <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />',
      'headset': '<path d="M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Zm0 0a9 9 0 1 1 18 0m0 0v5a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3Z" /> <path d="M21 16v2a4 4 0 0 1-4 4h-5" />',
      'coins': '<circle cx="8" cy="8" r="6" /> <path d="M18.09 10.37A6 6 0 1 1 10.34 18" /> <path d="M7 6h1v4" /> <path d="m16.71 13.88.7.71-2.82 2.82" />',
      'podcast': '<path d="M16.85 18.58a9 9 0 1 0-9.7 0" /> <path d="M8 14a5 5 0 1 1 8 0" /> <circle cx="12" cy="11" r="1" /> <path d="M13 17a1 1 0 1 0-2 0l.5 4.5a.5.5 0 1 0 1 0Z" />',
      'camera': '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /> <circle cx="12" cy="13" r="3" />',
      'lightbulb': '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" /> <path d="M9 18h6" /> <path d="M10 22h4" />',
      'truck': '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" /> <path d="M15 18H9" /> <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" /> <circle cx="17" cy="18" r="2" /> <circle cx="7" cy="18" r="2" />',
      'target': '<circle cx="12" cy="12" r="10" /> <circle cx="12" cy="12" r="6" /> <circle cx="12" cy="12" r="2" />',
      'banknote': '<rect width="20" height="12" x="2" y="6" rx="2" /> <circle cx="12" cy="12" r="2" /> <path d="M6 12h.01M18 12h.01" />',
      'clipboard-list': '<rect width="8" height="4" x="8" y="2" rx="1" ry="1" /> <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /> <path d="M12 11h4" /> <path d="M12 16h4" /> <path d="M8 11h.01" /> <path d="M8 16h.01" />',
      'rss': '<path d="M4 11a9 9 0 0 1 9 9" /> <path d="M4 4a16 16 0 0 1 16 16" /> <circle cx="5" cy="19" r="1" />',
      'hash': '<line x1="4" x2="20" y1="9" y2="9" /> <line x1="4" x2="20" y1="15" y2="15" /> <line x1="10" x2="8" y1="3" y2="21" /> <line x1="16" x2="14" y1="3" y2="21" />',
      'shield-check': '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /> <path d="m9 12 2 2 4-4" />',
      'share-2': '<circle cx="18" cy="5" r="3" /> <circle cx="6" cy="12" r="3" /> <circle cx="18" cy="19" r="3" /> <line x1="8.59" x2="15.42" y1="13.51" y2="17.49" /> <line x1="15.41" x2="8.59" y1="6.51" y2="10.49" />',
      'search': '<circle cx="11" cy="11" r="8" /> <path d="m21 21-4.3-4.3" />',
      'sparkles': '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" /> <path d="M20 3v4" /> <path d="M22 5h-4" /> <path d="M4 17v2" /> <path d="M5 18H3" />',
      'thumbs-up': '<path d="M7 10v12" /> <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />',
      'bookmark': '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />',
      'ticket': '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" /> <path d="M13 5v2" /> <path d="M13 17v2" /> <path d="M13 11v2" />',
      'film': '<rect width="18" height="18" x="3" y="3" rx="2" /> <path d="M7 3v18" /> <path d="M3 7.5h4" /> <path d="M3 12h18" /> <path d="M3 16.5h4" /> <path d="M17 3v18" /> <path d="M17 7.5h4" /> <path d="M17 16.5h4" />',
      'shopping-cart': '<circle cx="8" cy="21" r="1" /> <circle cx="19" cy="21" r="1" /> <path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" />',
      'scissors': '<circle cx="6" cy="6" r="3" /> <path d="M8.12 8.12 12 12" /> <path d="M20 4 8.12 15.88" /> <circle cx="6" cy="18" r="3" /> <path d="M14.8 14.8 20 20" />',
      'message-circle': '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />',
      'wallet': '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" /> <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />',
      'info': '<circle cx="12" cy="12" r="10" /> <path d="M12 16v-4" /> <path d="M12 8h.01" />',
      'trending-up': '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /> <polyline points="16 7 22 7 22 13" />',
      'layers': '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" /> <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" /> <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />',
      'file-text': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /> <path d="M14 2v4a2 2 0 0 0 2 2h4" /> <path d="M10 9H8" /> <path d="M16 13H8" /> <path d="M16 17H8" />',
      'workflow': '<rect width="8" height="8" x="3" y="3" rx="2" /> <path d="M7 11v4a2 2 0 0 0 2 2h4" /> <rect width="8" height="8" x="13" y="13" rx="2" />',
      'percent': '<line x1="19" x2="5" y1="5" y2="19" /> <circle cx="6.5" cy="6.5" r="2.5" /> <circle cx="17.5" cy="17.5" r="2.5" />',
      'boxes': '<path d="M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42Z" /> <path d="m7 16.5-4.74-2.85" /> <path d="m7 16.5 5-3" /> <path d="M7 16.5v5.17" /> <path d="M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3Z" /> <path d="m17 16.5-5-3" /> <path d="m17 16.5 4.74-2.85" /> <path d="M17 16.5v5.17" /> <path d="M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8Z" /> <path d="M12 8 7.26 5.15" /> <path d="m12 8 4.74-2.85" /> <path d="M12 13.5V8" />',
      'download': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /> <polyline points="7 10 12 15 17 10" /> <line x1="12" x2="12" y1="15" y2="3" />',
      'rocket': '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" /> <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" /> <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" /> <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />',
      'receipt': '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" /> <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" /> <path d="M12 17.5v-11" />',
      'heart': '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />',
      'inbox': '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /> <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />',
      'clipboard-check': '<rect width="8" height="4" x="8" y="2" rx="1" ry="1" /> <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /> <path d="m9 14 2 2 4-4" />',
      'scale': '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" /> <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" /> <path d="M7 21h10" /> <path d="M12 3v18" /> <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />',
      'chart-no-axes-column': '<line x1="18" x2="18" y1="20" y2="10" /> <line x1="12" x2="12" y1="20" y2="4" /> <line x1="6" x2="6" y1="20" y2="14" />',
      'trending-down': '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7" /> <polyline points="16 17 22 17 22 11" />',
      'headphones': '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3" />',
      'text-quote': '<path d="M17 6H3" /> <path d="M21 12H8" /> <path d="M21 18H8" /> <path d="M3 12v6" />',
      'gallery-horizontal': '<path d="M2 3v18" /> <rect width="12" height="18" x="6" y="3" rx="2" /> <path d="M22 3v18" />',
      'palette': '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor" /> <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" /> <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" /> <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" /> <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />',
      'shopping-basket': '<path d="m15 11-1 9" /> <path d="m19 11-4-7" /> <path d="M2 11h20" /> <path d="m3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.7-7.4" /> <path d="M4.5 15.5h15" /> <path d="m5 11 4-7" /> <path d="m9 11 1 9" />',
      'handshake': '<path d="m11 17 2 2a1 1 0 1 0 3-3" /> <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" /> <path d="m21 3 1 11h-2" /> <path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" /> <path d="M3 4h8" />',
      'receipt-text': '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" /> <path d="M14 8H8" /> <path d="M16 12H8" /> <path d="M13 16H8" />',
      'warehouse': '<path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z" /> <path d="M6 18h12" /> <path d="M6 14h12" /> <rect width="12" height="12" x="6" y="10" />',
      'search-check': '<path d="m8 11 2 2 4-4" /> <circle cx="11" cy="11" r="8" /> <path d="m21 21-4.3-4.3" />',
      'send': '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" /> <path d="m21.854 2.147-10.94 10.939" />',
      'mic': '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /> <path d="M19 10v2a7 7 0 0 1-14 0v-2" /> <line x1="12" x2="12" y1="19" y2="22" />',
      'calculator': '<rect width="16" height="20" x="4" y="2" rx="2" /> <line x1="8" x2="16" y1="6" y2="6" /> <line x1="16" x2="16" y1="14" y2="18" /> <path d="M16 10h.01" /> <path d="M12 10h.01" /> <path d="M8 10h.01" /> <path d="M12 14h.01" /> <path d="M8 14h.01" /> <path d="M12 18h.01" /> <path d="M8 18h.01" />',
      'star-half': '<path d="M12 18.338a2.1 2.1 0 0 0-.987.244L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.12 2.12 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.12 2.12 0 0 0 1.597-1.16l2.309-4.679A.53.53 0 0 1 12 2" />',
      'badge-percent': '<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" /> <path d="m15 9-6 6" /> <path d="M9 9h.01" /> <path d="M15 15h.01" />',
      'thumbs-down': '<path d="M17 14V2" /> <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />',
      'messages-square': '<path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z" /> <path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1" />',
      'layout-template': '<rect width="18" height="7" x="3" y="3" rx="1" /> <rect width="9" height="7" x="3" y="14" rx="1" /> <rect width="5" height="7" x="16" y="14" rx="1" />',
      'list-video': '<path d="M12 12H3" /> <path d="M16 6H3" /> <path d="M12 18H3" /> <path d="m16 12 5 3-5 3v-6Z" />',
      'bot': '<path d="M12 8V4H8" /> <rect width="16" height="12" x="4" y="8" rx="2" /> <path d="M2 14h2" /> <path d="M20 14h2" /> <path d="M15 13v2" /> <path d="M9 13v2" />',
      'gauge': '<path d="m12 14 4-4" /> <path d="M3.34 19a10 10 0 1 1 17.32 0" />',
      'pen-tool': '<path d="M15.707 21.293a1 1 0 0 1-1.414 0l-1.586-1.586a1 1 0 0 1 0-1.414l5.586-5.586a1 1 0 0 1 1.414 0l1.586 1.586a1 1 0 0 1 0 1.414z" /> <path d="m18 13-1.375-6.874a1 1 0 0 0-.746-.776L3.235 2.028a1 1 0 0 0-1.207 1.207L5.35 15.879a1 1 0 0 0 .776.746L13 18" /> <path d="m2.3 2.3 7.286 7.286" /> <circle cx="11" cy="11" r="2" />',
      'square-play': '<rect width="18" height="18" x="3" y="3" rx="2" /> <path d="m9 8 6 4-6 4Z" />',
      'package-search': '<path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14" /> <path d="m7.5 4.27 9 5.15" /> <polyline points="3.29 7 12 12 20.71 7" /> <line x1="12" x2="12" y1="22" y2="12" /> <circle cx="18.5" cy="15.5" r="2.5" /> <path d="M20.27 17.27 22 19" />',
      'image-play': '<path d="m11 16-5 5" /> <path d="M11 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6.5" /> <path d="M15.765 22a.5.5 0 0 1-.765-.424V13.38a.5.5 0 0 1 .765-.424l5.878 3.674a1 1 0 0 1 0 1.696z" /> <circle cx="9" cy="9" r="2" />',
      'users-round': '<path d="M18 21a8 8 0 0 0-16 0" /> <circle cx="10" cy="8" r="5" /> <path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3" />',
      'qr-code': '<rect width="5" height="5" x="3" y="3" rx="1" /> <rect width="5" height="5" x="16" y="3" rx="1" /> <rect width="5" height="5" x="3" y="16" rx="1" /> <path d="M21 16h-3a2 2 0 0 0-2 2v3" /> <path d="M21 21v.01" /> <path d="M12 7v3a2 2 0 0 1-2 2H7" /> <path d="M3 12h.01" /> <path d="M12 3h.01" /> <path d="M12 16v.01" /> <path d="M16 12h1" /> <path d="M21 12v.01" /> <path d="M12 21v-1" />',
      'notebook-pen': '<path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4" /> <path d="M2 6h4" /> <path d="M2 10h4" /> <path d="M2 14h4" /> <path d="M2 18h4" /> <path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z" />',
      'map-pin': '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" /> <circle cx="12" cy="10" r="3" />',
      'user-plus': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /> <circle cx="9" cy="7" r="4" /> <line x1="19" x2="19" y1="8" y2="14" /> <line x1="22" x2="16" y1="11" y2="11" />',
      'box': '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /> <path d="m3.3 7 8.7 5 8.7-5" /> <path d="M12 22V12" />',
      'type': '<polyline points="4 7 4 4 20 4 20 7" /> <line x1="9" x2="15" y1="20" y2="20" /> <line x1="12" x2="12" y1="4" y2="20" />',
      'package-x': '<path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14" /> <path d="m7.5 4.27 9 5.15" /> <polyline points="3.29 7 12 12 20.71 7" /> <line x1="12" x2="12" y1="22" y2="12" /> <path d="m17 13 5 5m-5 0 5-5" />',
      'badge-check': '<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" /> <path d="m9 12 2 2 4-4" />',
      'hand-coins': '<path d="M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17" /> <path d="m7 21 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9" /> <path d="m2 16 6 6" /> <circle cx="16" cy="9" r="2.9" /> <circle cx="6" cy="5" r="3" />',
      'calendar-days': '<path d="M8 2v4" /> <path d="M16 2v4" /> <rect width="18" height="18" x="3" y="4" rx="2" /> <path d="M3 10h18" /> <path d="M8 14h.01" /> <path d="M12 14h.01" /> <path d="M16 14h.01" /> <path d="M8 18h.01" /> <path d="M12 18h.01" /> <path d="M16 18h.01" />',
    };

    /** 线性图标分组：names 里就是上面 SVG_ICONS 的键。 */
    const SVG_GROUPS = [
      { key: 'svgEcom', labelKey: 'iconGroupSvgEcom', names: ['shopping-cart', 'shopping-bag', 'store', 'package', 'package-check', 'tag', 'tags', 'credit-card', 'wallet', 'truck', 'receipt', 'gift', 'trophy', 'trending-up', 'chart-line', 'boxes', 'percent', 'ticket', 'banknote', 'coins'] },
      { key: 'svgSocial', labelKey: 'iconGroupSvgSocial', names: ['megaphone', 'clapperboard', 'video', 'camera', 'film', 'scissors', 'image', 'images', 'music', 'radio', 'podcast', 'rss', 'message-circle', 'message-square', 'thumbs-up', 'heart', 'magnet', 'target', 'bell', 'globe'] },
      { key: 'svgOps', labelKey: 'iconGroupSvgOps', names: ['headset', 'life-buoy', 'rotate-ccw', 'list-checks', 'clipboard-list', 'calendar', 'clock', 'timer', 'share-2', 'at-sign', 'hash', 'play', 'cast', 'users', 'user-check', 'workflow'] },
      { key: 'svgBizEcom', labelKey: 'iconGroupSvgBizEcom', names: ['search-check', 'badge-percent', 'package-search', 'package-x', 'shopping-basket', 'receipt-text', 'calculator', 'scale', 'clipboard-check', 'headphones', 'messages-square', 'star-half', 'thumbs-down', 'warehouse', 'box', 'hand-coins', 'badge-check', 'map-pin', 'gauge', 'chart-no-axes-column', 'banknote'] },
      { key: 'svgBizContent', labelKey: 'iconGroupSvgBizContent', names: ['type', 'text-quote', 'pen-tool', 'palette', 'layout-template', 'list-video', 'square-play', 'trending-down', 'user-plus', 'users-round', 'handshake', 'calendar-days', 'qr-code', 'send', 'inbox', 'bot', 'notebook-pen', 'mic', 'gallery-horizontal', 'image-play'] },      { key: 'svgCommon', labelKey: 'iconGroupSvgCommon', names: ['folder', 'folder-open', 'file-text', 'star', 'flame', 'check-circle', 'alert-circle', 'info', 'bookmark', 'lightbulb', 'rocket', 'chart-pie', 'search', 'filter', 'layers', 'link', 'upload', 'download', 'sparkles', 'shield-check'] },
    ];

    const SVG_ICON_PREFIX = 'svg:';

    /** 判断一个图标值是线性图标还是 emoji。 */
    function isSvgIcon(icon) {
      return typeof icon === 'string' && icon.indexOf(SVG_ICON_PREFIX) === 0;
    }

    /** 把一个线性图标渲染成内联 SVG（粗细/颜色跟随文字）。 */
    function svgIcon(name) {
      const inner = SVG_ICONS[name];
      if (inner === undefined) return null;
      return h('svg', {
        viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8,
        strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
        dangerouslySetInnerHTML: { __html: inner },
      });
    }
    const ICON_GROUPS = [
      { key: 'common', labelKey: 'iconGroupCommon', icons: ['📁', '🗂️', '⭐', '🔥', '✅', '❗', '📍', '🧩', '⚙️', '🗓️', '💡', '🎯'] },
      // 电商运营 / 新媒体营销是主要工作场景，放前面
      { key: 'ecom', labelKey: 'iconGroupEcom', icons: ['🛒', '🛍️', '📦', '🏷️', '💳', '💰', '🧾', '🎁', '🚚', '📮', '🏆', '📈', '💹', '🗃️', '🧮', '🔖'] },
      { key: 'marketing', labelKey: 'iconGroupMarketing', icons: ['📱', '🎥', '📸', '🎬', '🎙️', '✂️', '🖼️', '📣', '📢', '💬', '👍', '🧲', '🎯', '🔔', '🌐', '📇'] },
      { key: 'doc', labelKey: 'iconGroupDoc', icons: ['📄', '📝', '📑', '📚', '📖', '📓', '📒', '📔', '🗒️', '📋', '📌', '🔖', '✏️', '🖊️', '🖇️', '📎'] },
      { key: 'data', labelKey: 'iconGroupData', icons: ['📊', '📈', '📉', '🧮', '📐', '📏', '🗃️', '🗄️', '💹', '🧾', '📆', '📅', '⏱️', '🔢', '🔍', '📦'] },
      { key: 'tech', labelKey: 'iconGroupTech', icons: ['🖥️', '💻', '⌨️', '🖱️', '🛠️', '🔧', '🔨', '🧰', '🧪', '🧬', '🐍', '🌐', '🔌', '💾', '🛰️', '🤖'] },
      { key: 'media', labelKey: 'iconGroupMedia', icons: ['🎬', '🎨', '🖌️', '🖼️', '🎞️', '📷', '📸', '🎵', '🎧', '🎤', '🎹', '🎮', '🕹️', '📺', '📻', '🎬'] },
      { key: 'work', labelKey: 'iconGroupWork', icons: ['💼', '🧑‍💼', '🏢', '🏦', '💳', '💵', '💰', '🛒', '🧾', '⏳', '📤', '📥', '🤝', '📣', '🗳️', '✅'] },
      { key: 'life', labelKey: 'iconGroupLife', icons: ['☕', '🍵', '🍎', '🌱', '🌿', '🌸', '🌞', '🌙', '⭐', '✨', '❤️', '🎁', '🏠', '✈️', '🚀', '🧭'] },
      { key: 'mark', labelKey: 'iconGroupMark', icons: ['🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '⚡', '❓', '‼️', '🔔', '🔒', '🔓', '🚩'] },
    ];
    /** 图标总数（去掉跨组重复），给测试和文档用。 */
    const ICON_COUNT = new Set([].concat(...ICON_GROUPS.map((group) => group.icons))).size;
    const NO_TRANSLATE = () => '';

    /** 整体缩放三档：--wm-k 乘到所有尺寸上，所以字号、行高、图标一起变。中档比旧的 13px 略大。 */
    const SCALES = { sm: 0.9, md: 1.08, lg: 1.38 };
    const SCALE_KEYS = ['sm', 'md', 'lg'];
    /** 三档按钮上显示的文字对应的文案键。 */
    const SCALE_LABEL_KEYS = { sm: 'scaleSmall', md: 'scaleMedium', lg: 'scaleLarge' };
    /** 左栏宽度的基准值（未乘缩放系数），可以左右拖动，双击复位到这个值。 */
    const NAV_WIDTH_DEFAULT = 224;
    const NAV_WIDTH_MIN = 170;
    const NAV_WIDTH_MAX = 620;
    const NAV_KEY_STEP = 16;

    // ------------------------------------------------------------- 多语言文案

    const ZH = {
      title: '工作区管理',
      sub: '每个项目下可以新建文件夹，把对话归类整理。',
      search: '搜索（Ctrl+K）',
      addProject: '添加项目',
      addFolder: '新建文件夹',
      addSub: '新建子文件夹',
      rename: '重命名',
      remove: '删除',
      open: '打开',
      clickToOpen: '打开对话',
      archive: '归档',
      archiveConfirm: '确认归档',
      archiveHint: '归档后可在「归档区」恢复，对话不会丢失',
      closeMenu: '关闭',
      menu: '更多操作',
      restore: '恢复',
      newSession: '新建对话',
      uncategorized: '未分类',
      // 左栏这一项不是"新收到的对话"，而是「跨项目、还没放进任何分类」的汇总，所以不叫收件箱
      unfiled: '待归类',
      archivedView: '归档区',
      folderName: '文件夹名称',
      confirm: '再点一次确认删除',
      cancel: '取消',
      save: '确定',
      empty: '还没有任何项目。',
      emptyHint: '点击「添加项目」选择磁盘目录；已有项目会自动出现在这里。',
      noMatch: '没有匹配的结果。',
      noSessions: '该项目下还没有对话。',
      unfiledEmpty: '没有待归类的对话，很整洁。',
      archivedEmpty: '还没有归档的对话。',
      moveTo: '归类到',
      back: '返回对话',
      storage: '文件夹、归类与视图偏好保存在本浏览器本地，不会改动磁盘文件。',
      untitledFolder: '未命名文件夹',
      untitledSession: '未命名对话',
      expand: '展开',
      collapse: '收起',
      countProjects: '个项目',
      countFolders: '个文件夹',
      countSessions: '个对话',
      failed: '操作失败',
      pin: '置顶',
      unpin: '取消置顶',
      color: '切换颜色',
      colorPick: '选择颜色',
      clearColor: '清除颜色',
      icon: '选择图标',
      clearIcon: '清除图标',
      iconGroupCommon: '常用',
      iconGroupEcom: '电商',
      iconGroupMarketing: '新媒体',
      iconGroupSvgEcom: '电商·线',
      iconGroupSvgSocial: '新媒体·线',
      iconGroupSvgOps: '运营客服·线',
      iconGroupSvgBizEcom: '电商运营·线',
      iconGroupSvgBizContent: '内容营销·线',
      iconGroupSvgCommon: '通用·线',
      iconGroupDoc: '文档',
      iconGroupData: '数据',
      iconGroupTech: '技术',
      iconGroupMedia: '媒体',
      iconGroupWork: '工作',
      iconGroupLife: '生活',
      iconGroupMark: '标记',
      sortLabel: '排序',
      sortRecent: '最近活动',
      sortTitle: '按名称',
      sortCreated: '按创建时间',
      view: '查看',
      expandAll: '全部展开',
      collapseAll: '全部折叠',
      expandAllHint: '把这个项目的所有分类都展开',
      collapseAllHint: '把这个项目的所有分类都折叠',
      pinPane: '固定到右侧',
      pinOn: '已固定到右侧',
      pinOffHint: '打开对话时自动把分类树挂到右侧栏；点一下取消',
      pinHint: '固定在右侧栏，打开对话也不会被关掉（需要先有一个打开的对话）',
      pinNavigating: '已回到对话页并展开右侧栏；没看到就点开一个对话再试一次。',
      openMain: '展开到主面板',
      paneGuide: '在右侧栏常驻一份分类树，边聊边归类。',
      viewHint: '查看这个分类里的对话',
      scaleLabel: '界面大小',
      scaleSmall: '小',
      scaleMedium: '中',
      scaleLarge: '大',
      splitHint: '左右拖动调整左栏宽度（双击复位）',
      selected: '已选',
      assignTo: '批量归类到',
      clearSelection: '取消选择',
      undo: '撤销',
      undoDelete: '已删除文件夹「{name}」',
      rootZone: '未分类',
      siblingUp: '上移',
      siblingDown: '下移',
      dropHint: '拖到文件夹可归类',
      manage: '管理分类',
      manageBack: '回到对话',
      manageTitle: '分类管理',
      manageHint: '集中管理这个项目下的所有分类：改名、换上级、调顺序、合并、清理空分类；点「查看」看分类里的对话。',
      colName: '分类',
      colParent: '上级',
      colCount: '对话',
      colActions: '操作',
      merge: '合并到',
      mergePick: '合并到…',
      mergeDone: '已合并到「{name}」',
      mergeSelf: '不能合并到自己或自己的子分类',
      cleanEmpty: '清理空分类',
      cleanEmptyNone: '没有空分类需要清理。',
      cleanEmptyDone: '已清理 {count} 个空分类',
      topLevel: '顶层',
      noFolders: '这个项目还没有分类，先新建一个。',
      folderCount: '{count} 个分类',
    };

    const EN = {
      title: 'Workspace Manager',
      sub: 'Create folders under each project and file its conversations.',
      search: 'Search (Ctrl+K)',
      addProject: 'Add project',
      addFolder: 'New folder',
      addSub: 'New subfolder',
      rename: 'Rename',
      remove: 'Delete',
      open: 'Open',
      clickToOpen: 'Open conversation',
      archive: 'Archive',
      archiveConfirm: 'Confirm archive',
      archiveHint: 'Restore it later from Archived — nothing is deleted',
      closeMenu: 'Close',
      menu: 'More actions',
      restore: 'Restore',
      newSession: 'New conversation',
      uncategorized: 'Unfiled',
      unfiled: 'To sort',
      archivedView: 'Archived',
      folderName: 'Folder name',
      confirm: 'Click again to delete',
      cancel: 'Cancel',
      save: 'OK',
      empty: 'No project yet.',
      emptyHint: 'Use Add project to pick a directory; existing projects appear here.',
      noMatch: 'Nothing matches.',
      noSessions: 'No conversation in this project yet.',
      unfiledEmpty: 'Nothing to sort — nice and tidy.',
      archivedEmpty: 'No archived conversation yet.',
      moveTo: 'Move to',
      back: 'Back to conversation',
      storage: 'Folders, filing and view preferences are stored in this browser; no files change on disk.',
      untitledFolder: 'Untitled folder',
      untitledSession: 'Untitled conversation',
      expand: 'Expand',
      collapse: 'Collapse',
      countProjects: 'projects',
      countFolders: 'folders',
      countSessions: 'conversations',
      failed: 'Action failed',
      pin: 'Pin to top',
      unpin: 'Unpin',
      color: 'Change color',
      colorPick: 'Pick a colour',
      clearColor: 'Clear colour',
      icon: 'Pick icon',
      clearIcon: 'Clear icon',
      iconGroupCommon: 'Common',
      iconGroupEcom: 'E-com',
      iconGroupMarketing: 'Social',
      iconGroupSvgEcom: 'E-com line',
      iconGroupSvgSocial: 'Social line',
      iconGroupSvgOps: 'Support line',
      iconGroupSvgBizEcom: 'Ops line',
      iconGroupSvgBizContent: 'Content line',
      iconGroupSvgCommon: 'Common line',
      iconGroupDoc: 'Docs',
      iconGroupData: 'Data',
      iconGroupTech: 'Tech',
      iconGroupMedia: 'Media',
      iconGroupWork: 'Work',
      iconGroupLife: 'Life',
      iconGroupMark: 'Marks',
      sortLabel: 'Sort',
      sortRecent: 'Recent activity',
      sortTitle: 'Name',
      sortCreated: 'Created time',
      view: 'View',
      expandAll: 'Expand all',
      collapseAll: 'Collapse all',
      expandAllHint: 'Expand every folder in this project',
      collapseAllHint: 'Collapse every folder in this project',
      pinPane: 'Pin to right side',
      pinOn: 'Pinned to right side',
      pinOffHint: 'Keep the folder tree in the right sidebar when a conversation opens; click to turn off',
      pinHint: 'Keep it in the right sidebar so a conversation does not close it (needs an open conversation)',
      pinNavigating: 'Back on the conversation page with the right bar opened; if it is missing, open a conversation and try again.',
      openMain: 'Open in main panel',
      paneGuide: 'A folder tree that stays in the right sidebar while you chat.',
      viewHint: 'Show the conversations in this folder',
      scaleLabel: 'Interface size',
      scaleSmall: 'Small',
      scaleMedium: 'Medium',
      scaleLarge: 'Large',
      splitHint: 'Drag sideways to resize the left column (double-click to reset)',
      selected: 'selected',
      assignTo: 'File selected into',
      clearSelection: 'Clear selection',
      undo: 'Undo',
      undoDelete: 'Deleted folder "{name}"',
      rootZone: 'Unfiled',
      siblingUp: 'Move up',
      siblingDown: 'Move down',
      dropHint: 'Drop onto a folder to file it',
      manage: 'Manage folders',
      manageBack: 'Back to conversations',
      manageTitle: 'Folder management',
      manageHint: 'Manage every folder in this project: rename, re-parent, reorder, merge, clean empty ones; click View to see its conversations.',
      colName: 'Folder',
      colParent: 'Parent',
      colCount: 'Chats',
      colActions: 'Actions',
      merge: 'Merge into',
      mergePick: 'Merge into…',
      mergeDone: 'Merged into "{name}"',
      mergeSelf: 'Cannot merge into itself or its own subfolder',
      cleanEmpty: 'Clean empty',
      cleanEmptyNone: 'No empty folder to clean.',
      cleanEmptyDone: 'Removed {count} empty folders',
      topLevel: 'Top level',
      noFolders: 'No folder in this project yet — create one first.',
      folderCount: '{count} folders',
    };

    // ---------------------------------------------------------------- 样式

    const CSS = [
      // --wm-k 是整体缩放系数（大/中/小三档），所有尺寸都乘它，所以字号、行高、按钮尺寸一起变
      '.wm-root{box-sizing:border-box;height:100%;min-height:0;display:flex;flex-direction:column;--wm-k:1;',
      // 语义变量：全部由主题 token 派生，明暗两套自动跟随；括号里是 token 缺失时的兜底值
      '--wm-surface:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.10));',
      '--wm-surface-2:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.18));',
      '--wm-line:var(--dsw-alias-border-l1,rgba(127,127,127,.30));',
      '--wm-line-2:var(--dsw-alias-border-l2,rgba(127,127,127,.46));',
      // 分类之间那条明显的分隔线：比普通边框重，明暗两套都看得见
      '--wm-line-strong:color-mix(in srgb, var(--wm-text) 24%, transparent);',
      '--wm-text:var(--dsw-alias-label-primary,currentColor);',
      '--wm-text-dim:color-mix(in srgb, var(--wm-text) 74%, transparent);',
      '--wm-accent:var(--dsw-alias-brand-primary,#2f6feb);',
      '--wm-accent-soft:color-mix(in srgb, var(--wm-accent) 16%, transparent);',
      '--wm-accent-line:color-mix(in srgb, var(--wm-accent) 52%, transparent);',
      '--wm-danger:var(--dsw-alias-state-error-primary,#d9534f);',
      '--wm-danger-soft:color-mix(in srgb, var(--wm-danger) 16%, transparent);',
      '--wm-danger-line:color-mix(in srgb, var(--wm-danger) 52%, transparent);',
      // 危险色直接当文字只有 3.4:1，掺主文字色后浅色变深、深色变亮，两边都能读
      '--wm-danger-text:color-mix(in srgb, var(--wm-danger) 70%, var(--wm-text));',
      '--wm-warn:var(--dsw-alias-state-warn-primary,#a97a00);',
      '--wm-warn-soft:color-mix(in srgb, var(--wm-warn) 16%, transparent);',
      // hover 用「主文字色」派生的半透明 tint：浅色 (黑 9%) 与深色 (白 9%) 都看得见
      '--wm-hover:color-mix(in srgb, var(--wm-text) 9%, transparent);',
      '--wm-hover-2:color-mix(in srgb, var(--wm-text) 16%, transparent);',
      'background:var(--dsw-alias-bg-base);color:var(--wm-text);font-size:calc(13px * var(--wm-k));line-height:1.45}',
      '.wm-body{display:flex;flex:1 1 auto;min-height:0}',
      '.wm-nav{box-sizing:border-box;flex:none;width:calc(224px * var(--wm-k));min-height:0;overflow:auto;',
      'padding:calc(14px * var(--wm-k)) calc(10px * var(--wm-k)) calc(18px * var(--wm-k));',
      'background:var(--wm-surface)}',
      '.wm-split{flex:none;width:6px;cursor:col-resize;position:relative;z-index:3;background:transparent;',
      'border-left:.5px solid var(--wm-line);transition:background .12s}',
      '.wm-split:hover,.wm-split-active{background:color-mix(in srgb, var(--wm-accent) 26%, transparent)}',
      '.wm-split:focus-visible{outline:2px solid var(--wm-accent);outline-offset:-2px}',
      '.wm-mainpane{box-sizing:border-box;flex:1 1 auto;min-width:0;min-height:0;display:flex;flex-direction:column}',
      '.wm-scroll{box-sizing:border-box;flex:1 1 auto;min-height:0;overflow:auto;',
      'padding:calc(4px * var(--wm-k)) calc(16px * var(--wm-k)) calc(24px * var(--wm-k))}',
      '.wm-head{display:flex;align-items:flex-start;gap:calc(10px * var(--wm-k));',
      'padding:calc(16px * var(--wm-k)) calc(18px * var(--wm-k)) calc(8px * var(--wm-k));flex:none}',
      '.wm-grow{flex:1 1 auto;min-width:0}',
      '.wm-title{margin:0;font-size:calc(15px * var(--wm-k));font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.wm-sub{margin:calc(3px * var(--wm-k)) 0 0;font-size:calc(12px * var(--wm-k));color:var(--wm-text-dim);',
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.wm-toolbar{display:flex;align-items:center;gap:calc(6px * var(--wm-k));flex-wrap:wrap;flex:none;',
      'padding:0 calc(18px * var(--wm-k)) calc(8px * var(--wm-k))}',
      '.wm-btn{display:inline-flex;align-items:center;gap:calc(5px * var(--wm-k));height:calc(27px * var(--wm-k));',
      'padding:0 calc(9px * var(--wm-k));border-radius:calc(6px * var(--wm-k));',
      'border:.5px solid var(--wm-line-2);background:var(--wm-surface);',
      'color:var(--wm-text);font:inherit;font-size:calc(12px * var(--wm-k));cursor:pointer;white-space:nowrap}',
      '.wm-btn:hover:not(:disabled){background:var(--wm-hover)}',
      '.wm-btn:disabled{opacity:.5;cursor:default}',
      '.wm-btn-primary{background:var(--wm-accent-soft);border-color:var(--wm-accent-line);color:var(--wm-accent)}',
      '.wm-btn-primary:hover:not(:disabled){background:color-mix(in srgb, var(--wm-accent) 28%, transparent);border-color:var(--wm-accent-line);color:var(--wm-accent)}',
      '.wm-btn-sm{height:calc(24px * var(--wm-k));padding:0 calc(7px * var(--wm-k));font-size:calc(11px * var(--wm-k))}',
      '.wm-input{box-sizing:border-box;height:calc(27px * var(--wm-k));padding:0 calc(8px * var(--wm-k));',
      'border-radius:calc(6px * var(--wm-k));',
      'border:.5px solid var(--wm-line-2);background:var(--wm-surface);',
      'color:var(--wm-text);font:inherit;font-size:calc(12px * var(--wm-k));outline:none}',
      '.wm-input:focus{border-color:var(--wm-accent);box-shadow:0 0 0 2px var(--wm-accent-soft)}',
      '.wm-search{width:100%;margin-bottom:calc(8px * var(--wm-k))}',
      '.wm-navit{display:flex;align-items:center;gap:calc(7px * var(--wm-k));height:calc(29px * var(--wm-k));',
      'padding:0 calc(8px * var(--wm-k));border-radius:calc(6px * var(--wm-k));cursor:pointer;',
      'color:var(--wm-text);background:transparent;border:0;width:100%;',
      'font:inherit;font-size:calc(12.5px * var(--wm-k));text-align:left}',
      '.wm-navit:hover{background:var(--wm-hover)}',
      '.wm-navit-active{background:var(--wm-hover);box-shadow:inset 2px 0 0 var(--wm-accent)}',
      '.wm-navname{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.wm-navcount{margin-left:auto;flex:none;font-size:calc(11px * var(--wm-k));color:var(--wm-text-dim)}',
      '.wm-card{border:.5px solid var(--wm-line);border-radius:calc(8px * var(--wm-k));',
      'background:var(--wm-surface);overflow:hidden}',
      '.wm-row{display:flex;align-items:center;gap:calc(6px * var(--wm-k));min-height:calc(30px * var(--wm-k));',
      'padding:0 calc(8px * var(--wm-k));position:relative}',
      '.wm-row:hover{background:var(--wm-hover)}',
      '.wm-row-focus{box-shadow:inset 0 0 0 2px var(--wm-accent)}',
      '.wm-row-hit{background:var(--wm-accent-soft)}',
      '.wm-row-drop{background:color-mix(in srgb, var(--wm-accent) 28%, transparent);box-shadow:inset 0 0 0 1px var(--wm-accent-line)}',
      '.wm-row-head{background:var(--wm-hover);font-size:calc(11px * var(--wm-k));color:var(--wm-text-dim);',
      'min-height:calc(26px * var(--wm-k));border-bottom:.5px solid var(--wm-line)}',
      // 每个分类是一组：组头上方一条明显的分隔线 + 留白，展开后也不会和下一个分类糊在一起
      // 右侧栏紧凑版：没有左栏，顶部换成一行「项目下拉 + 待归类 / 归档」
      '.wm-compact .wm-head,.wm-compact .wm-toolbar,.wm-compact .wm-nav,.wm-compact .wm-split,.wm-compact .wm-hint{display:none}',
      '.wm-compact .wm-scroll{padding:calc(4px * var(--wm-k)) calc(8px * var(--wm-k)) calc(12px * var(--wm-k))}',
      '.wm-panebar{display:flex;align-items:center;gap:calc(6px * var(--wm-k));flex:none;flex-wrap:wrap;',
      'padding:calc(8px * var(--wm-k)) calc(10px * var(--wm-k));border-bottom:.5px solid var(--wm-line)}',
      '.wm-pane-project{max-width:calc(150px * var(--wm-k))}',
      '.wm-panechip{flex:none;border:.5px solid var(--wm-line-2);background:var(--wm-surface);color:var(--wm-text);',
      'cursor:pointer;font:inherit;font-size:calc(11px * var(--wm-k));height:calc(22px * var(--wm-k));',
      'padding:0 calc(7px * var(--wm-k));border-radius:calc(5px * var(--wm-k))}',
      '.wm-panechip:hover{background:var(--wm-hover)}',
      '.wm-panechip-active{background:var(--wm-accent-soft);color:var(--wm-accent);border-color:var(--wm-accent-line)}',
      '.wm-pane-title{font-weight:500}',
      '.wm-row-sep{border-top:calc(1px * var(--wm-k)) solid var(--wm-line-strong);',
      'margin-top:calc(10px * var(--wm-k))}',
      '.wm-row-folder{background:var(--wm-hover);border-radius:calc(4px * var(--wm-k))}',
      '.wm-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.wm-name-folder{font-weight:500}',
      '.wm-name-link{border:0;background:transparent;color:inherit;font:inherit;padding:0;',
      'text-align:left;cursor:pointer;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.wm-name-link:hover{text-decoration:underline}',
      '.wm-menuro{display:flex;align-items:center;gap:calc(8px * var(--wm-k));',
      'padding:calc(3px * var(--wm-k)) calc(8px * var(--wm-k)) calc(8px * var(--wm-k));',
      'background:var(--wm-hover);border-bottom:.5px solid var(--wm-line)}',
      '.wm-btn-danger{background:var(--wm-danger-soft);border-color:var(--wm-danger-line);color:var(--wm-danger-text)}',
      '.wm-btn-danger:hover:not(:disabled){background:color-mix(in srgb, var(--wm-danger) 28%, transparent);border-color:var(--wm-danger-line);color:var(--wm-danger-text)}',
      '.wm-meta{flex:none;font-size:calc(11px * var(--wm-k));color:var(--wm-text-dim);white-space:nowrap}',
      '.wm-badge{flex:none;font-size:calc(11px * var(--wm-k));line-height:calc(16px * var(--wm-k));',
      'padding:0 calc(6px * var(--wm-k));border-radius:calc(9px * var(--wm-k));',
      'color:var(--wm-text-dim);background:var(--wm-hover);border:.5px solid var(--wm-line)}',
      '.wm-chev{flex:none;width:calc(16px * var(--wm-k));height:calc(16px * var(--wm-k));display:inline-flex;',
      'align-items:center;justify-content:center;border:0;background:transparent;color:var(--wm-text-dim);cursor:pointer;padding:0}',
      '.wm-glyph{flex:none;display:inline-flex;align-items:center;color:var(--wm-text-dim)}',
      '.wm-dot{flex:none;width:calc(9px * var(--wm-k));height:calc(9px * var(--wm-k));border-radius:50%;',
      'border:.5px solid var(--wm-line-2);cursor:pointer;padding:0;background:transparent}',
      '.wm-emoji{flex:none;font-size:calc(12px * var(--wm-k));line-height:1;cursor:pointer;background:transparent;border:0;padding:0}',
      '.wm-actions{display:flex;align-items:center;gap:calc(1px * var(--wm-k));opacity:0;transition:opacity .1s}',
      '.wm-row:hover .wm-actions{opacity:1}',
      '.wm-ghost{display:inline-flex;align-items:center;justify-content:center;height:calc(21px * var(--wm-k));',
      'min-width:calc(21px * var(--wm-k));padding:0 calc(4px * var(--wm-k));border-radius:calc(4px * var(--wm-k));',
      'border:0;background:transparent;cursor:pointer;color:var(--wm-text-dim);font:inherit;font-size:calc(11px * var(--wm-k))}',
      '.wm-ghost:hover{background:var(--wm-hover);color:var(--wm-text)}',
      '.wm-ghost-danger{color:var(--wm-danger)}',
      '.wm-ghost-danger:hover{background:var(--wm-danger-soft);color:var(--wm-danger-text)}',
      '.wm-actsep{flex:none;width:1px;align-self:stretch;background:var(--wm-line);',
      'margin:calc(2px * var(--wm-k)) calc(4px * var(--wm-k))}',
      '.wm-select{flex:none;height:calc(22px * var(--wm-k));max-width:calc(132px * var(--wm-k));',
      'border-radius:calc(5px * var(--wm-k));padding:0 calc(3px * var(--wm-k));',
      'border:.5px solid var(--wm-line-2);background:var(--wm-surface);',
      'color:var(--wm-text);font:inherit;font-size:calc(11px * var(--wm-k))}',
      '.wm-check{flex:none;width:calc(13px * var(--wm-k));height:calc(13px * var(--wm-k));margin:0;',
      'accent-color:var(--wm-accent);cursor:pointer}',
      '.wm-chip{flex:none;font-size:calc(10.5px * var(--wm-k));line-height:calc(15px * var(--wm-k));',
      'padding:0 calc(5px * var(--wm-k));border-radius:calc(8px * var(--wm-k));',
      'color:var(--wm-text-dim);background:var(--wm-hover);border:.5px solid var(--wm-line)}',
      '.wm-editor{display:flex;align-items:center;gap:calc(6px * var(--wm-k));',
      'padding:calc(3px * var(--wm-k)) calc(8px * var(--wm-k)) calc(7px * var(--wm-k))}',
      '.wm-colors{display:flex;align-items:flex-start;gap:calc(6px * var(--wm-k));flex-wrap:wrap;',
      'padding:calc(4px * var(--wm-k)) calc(8px * var(--wm-k)) calc(8px * var(--wm-k))}',
      '.wm-colorlabel{flex:none;font-size:calc(10px * var(--wm-k));color:var(--wm-text-dim);padding-top:calc(4px * var(--wm-k))}',
      '.wm-colorgrid{display:grid;grid-template-columns:repeat(7, auto);gap:calc(4px * var(--wm-k))}',
      '.wm-swatch{width:calc(18px * var(--wm-k));height:calc(18px * var(--wm-k));border-radius:50%;',
      'border:.5px solid var(--wm-line-2);background:var(--wm-surface);cursor:pointer;padding:0;',
      'font:inherit;font-size:calc(10px * var(--wm-k));line-height:1;color:var(--wm-text-dim)}',
      '.wm-swatch:hover{transform:scale(1.14)}',
      '.wm-swatch-active{box-shadow:0 0 0 2px var(--wm-accent)}',
      // 自绘提示：固定在指针上方，永不压住鼠标
      '.wm-tip{position:fixed;z-index:2147483000;pointer-events:none;',
      'transform:translate(-50%,calc(-100% - calc(14px * var(--wm-k))));max-width:calc(320px * var(--wm-k));',
      'padding:calc(5px * var(--wm-k)) calc(8px * var(--wm-k));border-radius:calc(6px * var(--wm-k));',
      'border:.5px solid var(--wm-line-2);background:var(--dsw-alias-bg-overlay,var(--wm-surface-2));',
      'color:var(--wm-text);font-size:calc(11px * var(--wm-k));line-height:1.45;',
      'white-space:pre-wrap;word-break:break-word;box-shadow:0 10px 26px rgba(0,0,0,.28)}',
      '.wm-emoji-svg{color:var(--wm-text)}',
      '.wm-emoji-svg svg{width:calc(15px * var(--wm-k));height:calc(15px * var(--wm-k));display:block}',
      '.wm-svgbtn{width:calc(24px * var(--wm-k));height:calc(24px * var(--wm-k));border-radius:calc(5px * var(--wm-k));',
      'border:.5px solid transparent;background:transparent;cursor:pointer;padding:0;display:inline-flex;',
      'align-items:center;justify-content:center;color:var(--wm-text)}',
      '.wm-svgbtn:hover{border-color:var(--wm-line-2);background:var(--wm-hover)}',
      '.wm-svgbtn-active{border-color:var(--wm-accent-line);background:var(--wm-accent-soft);color:var(--wm-accent)}',
      '.wm-svgbtn svg{width:calc(16px * var(--wm-k));height:calc(16px * var(--wm-k));display:block}',
      '.wm-icons{display:flex;flex-direction:column;gap:calc(3px * var(--wm-k));flex:none;',
      'padding:calc(6px * var(--wm-k)) calc(8px * var(--wm-k)) calc(8px * var(--wm-k));',
      'max-height:calc(230px * var(--wm-k));overflow:auto}',
      '.wm-iconrow{display:flex;align-items:flex-start;gap:calc(6px * var(--wm-k))}',
      '.wm-iconlabel{flex:none;width:calc(30px * var(--wm-k));font-size:calc(10px * var(--wm-k));',
      'color:var(--wm-text-dim);padding-top:calc(6px * var(--wm-k));text-align:left}',
      '.wm-icongrid{display:flex;flex-wrap:wrap;gap:calc(1px * var(--wm-k))}',
      '.wm-icons button{width:calc(24px * var(--wm-k));height:calc(24px * var(--wm-k));',
      'border-radius:calc(5px * var(--wm-k));border:.5px solid transparent;background:transparent;',
      'cursor:pointer;font-size:calc(14px * var(--wm-k))}',
      '.wm-icons button:hover{border-color:var(--wm-line-2);background:var(--wm-hover)}',
      '.wm-batch{display:flex;align-items:center;gap:calc(8px * var(--wm-k));flex:none;',
      'padding:calc(6px * var(--wm-k)) calc(18px * var(--wm-k));',
      'background:var(--wm-accent-soft);',
      'border-top:.5px solid var(--wm-line);border-bottom:.5px solid var(--wm-line)}',
      '.wm-notice{display:flex;align-items:center;gap:calc(8px * var(--wm-k));flex:none;',
      'margin:calc(8px * var(--wm-k)) calc(18px * var(--wm-k)) 0;',
      'padding:calc(7px * var(--wm-k)) calc(10px * var(--wm-k));border-radius:calc(7px * var(--wm-k));',
      'font-size:calc(12px * var(--wm-k));',
      'background:var(--wm-warn-soft);border:.5px solid color-mix(in srgb, var(--wm-warn) 40%, transparent);',
      'color:var(--wm-text)}',
      '.wm-empty{padding:calc(30px * var(--wm-k)) calc(14px * var(--wm-k));text-align:center;',
      'color:var(--wm-text-dim);font-size:calc(12px * var(--wm-k))}',
      '.wm-hint{margin:0;padding:0 calc(18px * var(--wm-k)) calc(14px * var(--wm-k));',
      'font-size:calc(11px * var(--wm-k));color:var(--wm-text-dim)}',
      '.wm-actions-show{opacity:1}',
      '.wm-mhead{min-height:calc(24px * var(--wm-k));font-size:calc(11px * var(--wm-k));',
      'color:var(--wm-text-dim);gap:calc(8px * var(--wm-k))}',
      '.wm-mhead-name{min-width:0;flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.wm-mhead-col{flex:none;width:calc(112px * var(--wm-k))}',
      '.wm-mhead-col-right{flex:none;width:calc(158px * var(--wm-k));text-align:right}',
      '.wm-manage-name{font-weight:500;max-width:calc(220px * var(--wm-k))}',
      '.wm-select-parent{max-width:calc(140px * var(--wm-k))}',
      // 界面大小三段按钮：三个档位同时可见，点一下就切
      '.wm-scale{display:inline-flex;flex:none;align-items:center;overflow:hidden;',
      'border:.5px solid var(--wm-line-2);border-radius:calc(6px * var(--wm-k))}',
      '.wm-scalebtn{border:0;background:transparent;color:var(--wm-text-dim);font:inherit;',
      'font-size:calc(11px * var(--wm-k));height:calc(22px * var(--wm-k));padding:0 calc(8px * var(--wm-k));cursor:pointer}',
      '.wm-scalebtn:hover{background:var(--wm-surface-2);color:var(--wm-text)}',
      '.wm-scalebtn-active{background:var(--wm-accent-soft);color:var(--wm-accent);box-shadow:inset 0 0 0 1px var(--wm-accent-line)}',
      '.wm-scalebtn-active:hover{background:color-mix(in srgb, var(--wm-accent) 26%, transparent);color:var(--wm-accent)}',
      '.wm-totals{display:flex;gap:calc(12px * var(--wm-k));font-size:calc(11px * var(--wm-k));',
      'color:var(--wm-text-dim)}',
      '.wm-name-toggle{border:0;background:transparent;color:inherit;font:inherit;padding:0;',
      'text-align:left;cursor:pointer;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.wm-name-toggle:hover{text-decoration:underline}',
      '.wm-badge-btn{border:.5px solid var(--wm-line);background:var(--wm-hover);color:var(--wm-text-dim);',
      'cursor:pointer;font:inherit;font-size:calc(11px * var(--wm-k));line-height:calc(16px * var(--wm-k));',
      'padding:0 calc(6px * var(--wm-k));border-radius:calc(9px * var(--wm-k))}',
      '.wm-badge-btn:hover{background:var(--wm-accent-soft);color:var(--wm-accent);border-color:var(--wm-accent-line)}',
      // 键盘焦点：统一品牌色环，暗色主题下也能看见
      '.wm-btn:focus-visible,.wm-input:focus-visible,.wm-select:focus-visible,.wm-navit:focus-visible,',
      '.wm-ghost:focus-visible,.wm-emoji:focus-visible,.wm-chev:focus-visible,.wm-dot:focus-visible{',
      'outline:2px solid var(--wm-accent);outline-offset:1px}',
      // 原生下拉列表跟着主题走，否则暗色下会冒出白底黑字
      '.wm-root option{background:var(--wm-surface);color:var(--wm-text)}',
    ].join('');

    function StyleTag() {
      return h('style', { 'data-plugin': '@local/workspace-manager' }, CSS);
    }

    // ---------------------------------------------------------------- 存储

    function emptyStore() {
      return {
        version: 2,
        projects: {},
        prefs: {
          sort: 'recent',
          activeKind: 'project',
          activeProjectId: '',
          manage: false,
          autoPin: true,
          scale: 'md',
          navWidth: NAV_WIDTH_DEFAULT,
        },
      };
    }

    function normalizeFolder(folder) {
      return {
        id: typeof folder.id === 'string' ? folder.id : String(folder.id),
        name: typeof folder.name === 'string' ? folder.name : '',
        parentId: typeof folder.parentId === 'string' && folder.parentId !== '' ? folder.parentId : null,
        color: typeof folder.color === 'number' && folder.color >= 0 && folder.color < PALETTE.length ? folder.color : 0,
        icon: typeof folder.icon === 'string' ? folder.icon : '',
        pinned: folder.pinned === true,
      };
    }

    function normalizeRecord(record) {
      const folders = Array.isArray(record && record.folders) ? record.folders : [];
      const assignments = record && typeof record.assignments === 'object' && record.assignments !== null
        ? record.assignments
        : {};
      const output = { folders: [], assignments: {} };
      for (const folder of folders) {
        if (folder === null || folder === undefined) continue;
        const normalized = normalizeFolder(folder);
        if (normalized.id === '') continue;
        output.folders.push(normalized);
      }
      for (const key of Object.keys(assignments)) {
        if (typeof assignments[key] === 'string') output.assignments[key] = assignments[key];
      }
      return output;
    }

    /** 只接受 sm / md / lg，其它值一律回落到中档。 */
    function normalizeScale(value) {
      return SCALE_KEYS.indexOf(value) >= 0 ? value : 'md';
    }

    /** 缩放系数：乘到 CSS 的 --wm-k 上。 */
    function scaleFactorOf(scale) {
      return SCALES[normalizeScale(scale)];
    }

    /** 左栏基准宽度：限制在可用区间内，非数字回落到默认值。 */
    function clampNavWidth(value) {
      const number = typeof value === 'number' && Number.isFinite(value) ? value : NAV_WIDTH_DEFAULT;
      return Math.round(Math.min(NAV_WIDTH_MAX, Math.max(NAV_WIDTH_MIN, number)));
    }

    function normalizePrefs(prefs) {
      const source = prefs && typeof prefs === 'object' ? prefs : {};
      const sort = source.sort === 'title' || source.sort === 'created' ? source.sort : 'recent';
      const activeKind = source.activeKind === 'unfiled' || source.activeKind === 'archived'
        ? source.activeKind
        : 'project';
      return {
        sort,
        activeKind,
        activeProjectId: typeof source.activeProjectId === 'string' ? source.activeProjectId : '',
        manage: source.manage === true,
        // 打开对话时自动把分类树挂到右侧栏，主区域留给对话（默认开）
        autoPin: source.autoPin !== false,
        scale: normalizeScale(source.scale),
        navWidth: clampNavWidth(source.navWidth),
      };
    }

    function adoptStore(parsed) {
      const store = emptyStore();
      const projects = parsed && parsed.projects && typeof parsed.projects === 'object' ? parsed.projects : {};
      for (const key of Object.keys(projects)) store.projects[key] = normalizeRecord(projects[key]);
      store.prefs = normalizePrefs(parsed ? parsed.prefs : null);
      return store;
    }

    function readStore() {
      try {
        const raw = window.localStorage.getItem(STORE_KEY);
        if (raw !== null) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.version === 2) return adoptStore(parsed);
        }
        const legacy = window.localStorage.getItem(LEGACY_KEY);
        if (legacy !== null) {
          const parsed = JSON.parse(legacy);
          if (parsed && parsed.version === 1) return adoptStore(parsed);
        }
      } catch (error) {
        console.warn('[workspace-manager] cannot read the saved folders', error);
      }
      return emptyStore();
    }

    function writeStore(store) {
      try {
        window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
      } catch (error) {
        console.warn('[workspace-manager] cannot save the folders', error);
      }
    }

    // -------------------------------------------------------------- 工具函数

    function asArray(value) {
      return Array.isArray(value) ? value : [];
    }

    function sessionIdOf(session) {
      if (!session || typeof session !== 'object') return '';
      const id = session.id !== undefined ? session.id : session.sessionId;
      return typeof id === 'string' ? id : '';
    }

    function sessionTitle(session, t) {
      const raw = session ? (session.title !== undefined ? session.title : session.name) : '';
      const text = typeof raw === 'string' ? raw.trim() : '';
      if (text !== '') return text;
      const id = sessionIdOf(session);
      return id !== '' ? id.slice(0, 8) : t('untitledSession');
    }

    function stampOf(session, field) {
      const raw = session ? session[field] : undefined;
      if (raw === undefined || raw === null || raw === '') return 0;
      const time = new Date(raw).getTime();
      return Number.isFinite(time) ? time : 0;
    }

    function sortSessions(list, mode) {
      const copy = list.slice();
      if (mode === 'title') {
        copy.sort((left, right) => sessionTitle(left, NO_TRANSLATE)
          .localeCompare(sessionTitle(right, NO_TRANSLATE), 'zh-Hans-CN'));
        return copy;
      }
      const field = mode === 'created' ? 'createdAt' : 'updatedAt';
      copy.sort((left, right) => {
        const a = stampOf(left, field) || stampOf(left, 'time') || stampOf(left, 'createdAt');
        const b = stampOf(right, field) || stampOf(right, 'time') || stampOf(right, 'createdAt');
        return b - a;
      });
      return copy;
    }

    function folderNameOf(folder, t) {
      const text = folder && typeof folder.name === 'string' ? folder.name.trim() : '';
      return text !== '' ? text : t('untitledFolder');
    }

    function messageOf(error) {
      if (error && typeof error.message === 'string' && error.message !== '') return error.message;
      return String(error);
    }

    function formatTime(value) {
      if (value === undefined || value === null || value === '') return '';
      const date = value instanceof Date ? value : new Date(value);
      const time = date.getTime();
      if (!Number.isFinite(time)) return '';
      const pad = (number) => String(number).padStart(2, '0');
      return pad(date.getFullYear()) + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
        + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
    }

    function newFolderId() {
      return 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function projectRecord(store, workspaceId) {
      const found = store.projects[workspaceId];
      return found ? found : { folders: [], assignments: {} };
    }

    function displayFolders(folders) {
      const copy = folders.slice();
      copy.sort((left, right) => (right.pinned === true ? 1 : 0) - (left.pinned === true ? 1 : 0));
      return copy;
    }

    function buildView(record, sessions) {
      const folders = displayFolders(record.folders);
      const folderIds = new Set();
      for (const folder of folders) folderIds.add(folder.id);
      const children = new Map();
      for (const folder of folders) {
        const parent = folder.parentId !== null && folderIds.has(folder.parentId) ? folder.parentId : null;
        const list = children.get(parent);
        if (list === undefined) children.set(parent, [folder]);
        else list.push(folder);
      }
      const bucket = new Map();
      const loose = [];
      for (const session of sessions) {
        const id = sessionIdOf(session);
        const target = record.assignments[id];
        if (typeof target === 'string' && folderIds.has(target)) {
          const list = bucket.get(target);
          if (list === undefined) bucket.set(target, [session]);
          else list.push(session);
        } else {
          loose.push(session);
        }
      }
      return { folders, folderIds, children, bucket, loose };
    }

    function countFolder(view, folderId) {
      let total = asArray(view.bucket.get(folderId)).length;
      for (const child of asArray(view.children.get(folderId))) total += countFolder(view, child.id);
      return total;
    }

    function flattenFolders(view) {
      const output = [];
      const walk = (parentId, depth) => {
        for (const folder of asArray(view.children.get(parentId))) {
          const name = folder.name.trim();
          output.push({ id: folder.id, label: '　'.repeat(depth) + (name === '' ? '—' : name) });
          walk(folder.id, depth + 1);
        }
      };
      walk(null, 0);
      return output;
    }

    /** 按树序摊平全部分类，并保留缩进用的层级深度。 */
    function orderedFolders(view) {
      const output = [];
      const walk = (parentId, depth) => {
        for (const folder of asArray(view.children.get(parentId))) {
          output.push({ folder, depth });
          walk(folder.id, depth + 1);
        }
      };
      walk(null, 0);
      return output;
    }

    function descendantIds(view, folderId) {      const output = [folderId];
      const stack = [folderId];
      while (stack.length > 0) {
        const current = stack.pop();
        for (const child of asArray(view.children.get(current))) {
          output.push(child.id);
          stack.push(child.id);
        }
      }
      return output;
    }

    function siblingOrder(folders, parentId) {
      const output = [];
      for (const folder of displayFolders(folders)) {
        if ((folder.parentId === null ? null : folder.parentId) === parentId) output.push(folder);
      }
      return output;
    }

    // ---------------------------------------------------------------- hooks

    function useSource(source) {
      const [value, setValue] = React.useState(() => {
        try {
          return source.getSnapshot();
        } catch (error) {
          console.warn('[workspace-manager] snapshot read failed', error);
          return undefined;
        }
      });
      React.useEffect(() => {
        let alive = true;
        const sync = () => {
          if (!alive) return;
          try {
            setValue(source.getSnapshot());
          } catch (error) {
            console.warn('[workspace-manager] snapshot read failed', error);
          }
        };
        sync();
        const off = source.subscribe(sync);
        return () => {
          alive = false;
          if (typeof off === 'function') off();
        };
      }, [source]);
      return value;
    }

    // ---------------------------------------------------------------- 图标

    function ChevronGlyph(props) {
      return h('svg', {
        width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none', 'aria-hidden': true,
        style: props.open === true ? undefined : { transform: 'rotate(-90deg)' },
      }, h('path', {
        d: 'M2.5 4.5L6 8L9.5 4.5', stroke: 'currentColor', strokeWidth: 1.4,
        strokeLinecap: 'round', strokeLinejoin: 'round',
      }));
    }

    function FolderGlyph() {
      return h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', {
          d: 'M2 3.8C2 3.36 2.36 3 2.8 3H6L7.4 4.6H13.2C13.64 4.6 14 4.96 14 5.4V6H2V3.8Z',
          fill: 'currentColor', fillOpacity: 0.45,
        }),
        h('path', {
          d: 'M2 6.6H14L12.9 12.2C12.82 12.62 12.46 12.92 12.04 12.92H3.96C3.54 12.92 3.18 12.62 3.1 12.2L2 6.6Z',
          fill: 'currentColor', fillOpacity: 0.85,
        }));
    }

    function SessionGlyph() {
      return h('svg', { width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', {
          d: 'M3 4.2C3 3.54 3.54 3 4.2 3H11.8C12.46 3 13 3.54 13 4.2V9.6C13 10.26 12.46 10.8 11.8 10.8H7.4L4.6 13V10.8H4.2C3.54 10.8 3 10.26 3 9.6V4.2Z',
          fill: 'currentColor', fillOpacity: 0.3, stroke: 'currentColor', strokeWidth: 1.1,
        }));
    }

    function PanelIcon(props) {
      const size = typeof props.size === 'number' && props.size > 0 ? props.size : 18;
      const color = props.active === true ? 'var(--dsw-alias-brand-primary)' : 'currentColor';
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true,
        style: { color, display: 'block' },
      },
      h('path', {
        d: 'M3 5.6C3 4.72 3.72 4 4.6 4H9.2L11 6.1H19.4C20.28 6.1 21 6.82 21 7.7V8.9H3V5.6Z',
        fill: 'currentColor', fillOpacity: 0.6,
      }),
      h('path', {
        d: 'M3 9.6H21L19.5 18.1C19.38 18.82 18.75 19.32 18.02 19.32H5.98C5.25 19.32 4.62 18.82 4.5 18.1L3 9.6Z',
        fill: 'currentColor',
      }),
      h('path', { d: 'M9.4 21.2H14.6', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }));
    }

    // ------------------------------------------------------------ 主页面组件

    function PanelPage(props) {
      const t = typeof props.t === 'function' ? props.t : props.tr;
      const bridge = props.bridge;
      // 右侧栏里的紧凑版：没有左栏，顶部换成「项目下拉 + 待归类 / 归档」一行
      const compact = props.variant === 'pane';

      const [store, setStore] = React.useState(readStore);
      const [query, setQuery] = React.useState('');
      const [collapsed, setCollapsed] = React.useState({});
      const [editor, setEditor] = React.useState(null);
      const [creating, setCreating] = React.useState(null);
      const [iconPicker, setIconPicker] = React.useState(null);
      const [colorPicker, setColorPicker] = React.useState(null);
      // 自绘提示：固定在指针上方，pointer-events:none，不会被鼠标挡住
      const [tip, setTip] = React.useState(null);
      const [pending, setPending] = React.useState(null);
      const [selection, setSelection] = React.useState({});
      const [focused, setFocused] = React.useState('');
      const [dragOver, setDragOver] = React.useState('');
      const [notice, setNotice] = React.useState(null);
      const [undo, setUndo] = React.useState(null);
      const [busy, setBusy] = React.useState(false);
      const [menu, setMenu] = React.useState(null);
      const [armed, setArmed] = React.useState(false);
      const [mergeFrom, setMergeFrom] = React.useState(null);
      const [navDraft, setNavDraft] = React.useState(null);
      const [revealKey, setRevealKey] = React.useState('');

      const searchRef = React.useRef(null);
      const handlerRef = React.useRef(null);
      const dragRef = React.useRef('');
      const splitDragRef = React.useRef(null);

      React.useEffect(() => {
        writeStore(store);
      }, [store]);

      // 「查看」跳转后把目标行滚到视野中间（document 只在真实环境里有）
      React.useEffect(() => {
        if (revealKey === '') return;
        setRevealKey('');
        if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return;
        const node = document.querySelector('[data-nav-key="' + revealKey + '"]');
        if (node && typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'center' });
      }, [revealKey]);

      const workspaceSnapshot = useSource(bridge.workspaces);
      const sessionSnapshot = useSource(bridge.sessions);

      const archivedIds = React.useMemo(
        () => new Set(asArray(workspaceSnapshot ? workspaceSnapshot.archivedSessionIds : null)),
        [workspaceSnapshot],
      );

      const sessionById = (sessionSnapshot && sessionSnapshot.byId) ? sessionSnapshot.byId : {};
      const projects = asArray(workspaceSnapshot ? workspaceSnapshot.items : null);
      const prefs = store.prefs;
      const sortMode = prefs.sort;
      const manageMode = compact ? false : prefs.manage === true;

      const setPrefs = (patch) => {
        setStore((current) => ({ ...current, prefs: { ...current.prefs, ...patch } }));
      };

      // 界面大小与左栏宽度：都存进 prefs，所以刷新、重启后保持
      const scaleKey = normalizeScale(prefs.scale);
      const scaleK = scaleFactorOf(scaleKey);
      const navBase = clampNavWidth(prefs.navWidth);
      const navBaseLive = navDraft === null ? navBase : navDraft;
      const navWidthPx = Math.round(navBaseLive * scaleK);
      const rootStyle = { '--wm-k': String(scaleK) };

      /** 分栏拖拽：按下记起点，移动时按缩放系数换回基准宽度，松开才落盘（拖动过程不写存储）。 */
      const splitDown = (event) => {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        const startX = typeof event.clientX === 'number' ? event.clientX : 0;
        splitDragRef.current = { startX, startBase: navBaseLive };
        const node = event.currentTarget;
        if (node && typeof node.setPointerCapture === 'function' && event.pointerId !== undefined) {
          try {
            node.setPointerCapture(event.pointerId);
          } catch (error) {
            /* 指针捕获不是所有环境都支持，失败也不影响拖动 */
          }
        }
        setNavDraft(navBaseLive);
      };

      const splitMove = (event) => {
        const drag = splitDragRef.current;
        if (!drag) return;
        const currentX = typeof event.clientX === 'number' ? event.clientX : drag.startX;
        setNavDraft(clampNavWidth(drag.startBase + (currentX - drag.startX) / scaleK));
      };

      const splitUp = (event) => {
        const drag = splitDragRef.current;
        if (!drag) return;
        splitDragRef.current = null;
        const node = event.currentTarget;
        if (node && typeof node.releasePointerCapture === 'function' && event.pointerId !== undefined) {
          try {
            node.releasePointerCapture(event.pointerId);
          } catch (error) {
            /* 释放失败忽略 */
          }
        }
        if (navDraft !== null) setPrefs({ navWidth: clampNavWidth(navDraft) });
        setNavDraft(null);
      };

      /** 分栏也能用键盘调：←→ 每次一格，Home 复位。事件要拦住，否则会同时触发列表导航。 */
      const splitKey = (event) => {
        const key = event.key;
        if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'Home') return;
        if (typeof event.preventDefault === 'function') event.preventDefault();
        if (typeof event.stopPropagation === 'function') event.stopPropagation();
        if (key === 'Home') {
          setPrefs({ navWidth: NAV_WIDTH_DEFAULT });
          return;
        }
        const step = (key === 'ArrowRight' ? NAV_KEY_STEP : -NAV_KEY_STEP) / scaleK;
        setPrefs({ navWidth: clampNavWidth(navBaseLive + step) });
      };

      const splitReset = () => setPrefs({ navWidth: NAV_WIDTH_DEFAULT });

      let activeProjectId = '';
      for (const project of projects) {
        if (project.workspaceId === prefs.activeProjectId) activeProjectId = project.workspaceId;
      }
      if (activeProjectId === '' && projects.length > 0) activeProjectId = projects[0].workspaceId;

      let activeProject = null;
      for (const project of projects) {
        if (project.workspaceId === activeProjectId) activeProject = project;
      }

      const viewKind = prefs.activeKind === 'unfiled' || prefs.activeKind === 'archived'
        ? prefs.activeKind
        : 'project';

      const needle = query.trim().toLowerCase();

      // ---- 派生数据 ------------------------------------------------------

      const projectSessions = (project) => {
        const output = [];
        for (const id of asArray(project.sessionIds)) {
          const session = sessionById[id];
          if (!session) continue;
          const sessionId = sessionIdOf(session);
          if (sessionId === '' || archivedIds.has(sessionId)) continue;
          output.push(session);
        }
        return sortSessions(output, sortMode);
      };

      const activeSessions = activeProject ? projectSessions(activeProject) : [];
      const activeView = activeProject
        ? buildView(projectRecord(store, activeProject.workspaceId), activeSessions)
        : null;

      const looseAll = [];
      for (const project of projects) {
        const view = buildView(projectRecord(store, project.workspaceId), projectSessions(project));
        for (const session of view.loose) looseAll.push({ project, session });
      }

      const archivedRows = [];
      if (viewKind === 'archived') {
        for (const id of archivedIds) {
          let owner = null;
          for (const project of projects) {
            if (asArray(project.sessionIds).indexOf(id) >= 0) owner = project;
          }
          archivedRows.push({ project: owner, session: sessionById[id], sessionId: id });
        }
      }

      // ---- 数据变更辅助 --------------------------------------------------

      const mutateProject = (workspaceId, mutate) => {
        setStore((current) => {
          const base = normalizeRecord(projectRecord(current, workspaceId));
          const next = normalizeRecord(mutate(base));
          return { ...current, projects: { ...current.projects, [workspaceId]: next } };
        });
      };

      const assignOne = (workspaceId, sessionId, folderId) => {
        mutateProject(workspaceId, (record) => {
          const assignments = { ...record.assignments };
          if (folderId === null) delete assignments[sessionId];
          else assignments[sessionId] = folderId;
          return { ...record, assignments };
        });
      };

      const showNotice = (text) => setNotice(text);

      // ---- 业务动作 ------------------------------------------------------

      // 打开对话：主区域让给对话，同时把分类树挂到右侧栏（autoPin 关掉就不挂）
      const openSession = (sessionId) => {
        bridge.openSession(sessionId);
        if (prefs.autoPin !== false && bridge.canPin === true) bridge.pin();
      };

      const archiveOne = (workspaceId, sessionId) => {
        Promise.resolve(bridge.archiveSession(sessionId)).then((failure) => {
          if (failure) {
            showNotice(t('failed') + ': ' + String(failure));
            return;
          }
          assignOne(workspaceId, sessionId, null);
        });
      };

      const restoreOne = (sessionId) => {
        Promise.resolve(bridge.unarchiveSession(sessionId)).then((failure) => {
          if (failure) showNotice(t('failed') + ': ' + String(failure));
        });
      };

      const newSession = (workspaceId, folderId) => {
        setBusy(true);
        Promise.resolve(bridge.startSessionIn(workspaceId)).then((sessionId) => {
          setBusy(false);
          if (!sessionId) {
            showNotice(t('failed'));
            return;
          }
          if (typeof folderId === 'string') assignOne(workspaceId, sessionId, folderId);
          bridge.openSession(sessionId);
        });
      };

      const beginNewFolder = (workspaceId, parentId) => {
        setEditor(null);
        setIconPicker(null);
        setCreating({ workspaceId, parentId: parentId === undefined ? null : parentId, value: '' });
      };

      const beginRename = (workspaceId, folder) => {
        setCreating(null);
        setIconPicker(null);
        setEditor({ workspaceId, folderId: folder.id, value: folder.name });
      };

      const commitEditor = () => {
        const name = creating !== null ? String(creating.value).trim() : String(editor ? editor.value : '').trim();
        if (creating !== null) {
          if (name !== '') {
            mutateProject(creating.workspaceId, (record) => ({
              ...record,
              folders: record.folders.concat([{
                id: newFolderId(), name, parentId: creating.parentId, color: 0, icon: '', pinned: false,
              }]),
            }));
          }
        } else if (editor !== null) {
          if (name !== '') {
            mutateProject(editor.workspaceId, (record) => ({
              ...record,
              folders: record.folders.map((folder) => (
                folder.id === editor.folderId ? { ...folder, name } : folder
              )),
            }));
          }
        }
        setCreating(null);
        setEditor(null);
      };

      const editValue = (value) => {
        if (creating !== null) setCreating({ ...creating, value });
        else if (editor !== null) setEditor({ ...editor, value });
      };

      const deleteFolder = (workspaceId, folder) => {
        if (pending !== folder.id) {
          setPending(folder.id);
          return;
        }
        setPending(null);
        const view = buildView(projectRecord(store, workspaceId), []);
        const removed = new Set(descendantIds(view, folder.id));
        const removedFolders = [];
        const removedAssignments = [];
        for (const candidate of projectRecord(store, workspaceId).folders) {
          if (removed.has(candidate.id)) removedFolders.push(candidate);
        }
        const assignmentsOfProject = projectRecord(store, workspaceId).assignments;
        for (const key of Object.keys(assignmentsOfProject)) {
          if (removed.has(assignmentsOfProject[key])) removedAssignments.push([key, assignmentsOfProject[key]]);
        }
        mutateProject(workspaceId, (record) => {
          const assignments = {};
          for (const key of Object.keys(record.assignments)) {
            if (!removed.has(record.assignments[key])) assignments[key] = record.assignments[key];
          }
          return {
            folders: record.folders.filter((candidate) => !removed.has(candidate.id)),
            assignments,
          };
        });
        setUndo({ workspaceId, folders: removedFolders, assignments: removedAssignments, name: folderNameOf(folder, t) });
      };

      const applyUndo = () => {
        if (undo === null) return;
        const pendingUndo = undo;
        setUndo(null);
        mutateProject(pendingUndo.workspaceId, (record) => {
          const folders = record.folders.slice();
          for (const folder of pendingUndo.folders) {
            let exists = false;
            for (const candidate of folders) if (candidate.id === folder.id) exists = true;
            if (!exists) folders.push(folder);
          }
          const assignments = { ...record.assignments };
          for (const pair of pendingUndo.assignments) assignments[pair[0]] = pair[1];
          return { folders, assignments };
        });
      };

      const setFolderMeta = (workspaceId, folderId, patch) => {
        mutateProject(workspaceId, (record) => ({
          ...record,
          folders: record.folders.map((folder) => (folder.id === folderId ? { ...folder, ...patch } : folder)),
        }));
      };

      const moveSibling = (workspaceId, folder, direction) => {
        const record = projectRecord(store, workspaceId);
        const siblings = siblingOrder(record.folders, folder.parentId);
        let index = -1;
        for (let position = 0; position < siblings.length; position++) {
          if (siblings[position].id === folder.id) index = position;
        }
        const targetIndex = index + direction;
        if (index < 0 || targetIndex < 0 || targetIndex >= siblings.length) return;
        const other = siblings[targetIndex];
        mutateProject(workspaceId, (current) => {
          const folders = current.folders.slice();
          let left = -1;
          let right = -1;
          for (let position = 0; position < folders.length; position++) {
            if (folders[position].id === folder.id) left = position;
            if (folders[position].id === other.id) right = position;
          }
          if (left < 0 || right < 0) return current;
          const swapped = folders.slice();
          swapped[left] = folders[right];
          swapped[right] = folders[left];
          return { ...current, folders: swapped };
        });
      };

      const moveFolderParent = (workspaceId, folderId, parentId) => {
        if (parentId !== null) {
          const view = buildView(projectRecord(store, workspaceId), []);
          if (descendantIds(view, folderId).indexOf(parentId) >= 0) return;
        }
        mutateProject(workspaceId, (current) => ({
          ...current,
          folders: current.folders.map((folder) => (
            folder.id === folderId ? { ...folder, parentId } : folder
          )),
        }));
      };

      /** 从分类管理点「查看」：切回对话视图，展开它所有上级，并选中这一行。 */
      const revealFolder = (workspaceId, folderId) => {
        const record = projectRecord(store, workspaceId);
        const byId = new Map();
        for (const folder of record.folders) byId.set(folder.id, folder);
        const ancestors = [];
        let cursor = byId.get(folderId);
        let guard = 0;
        while (cursor && cursor.parentId !== null && guard < 128) {
          ancestors.push(cursor.parentId);
          cursor = byId.get(cursor.parentId);
          guard++;
        }
        setCollapsed((current) => {
          const next = { ...current };
          for (const id of ancestors) delete next[id];
          delete next[folderId];
          return next;
        });
        setPrefs({ manage: false, activeKind: 'project', activeProjectId: workspaceId });
        const navKey = 'f|' + workspaceId + '|' + folderId;
        setFocused(navKey);
        setRevealKey(navKey);
      };

      /** 把某个分类（连同其下所有子分类）合并进另一个分类，对话一条都不丢。 */
      const mergeFolder = (workspaceId, sourceId, targetId) => {
        const record = normalizeRecord(projectRecord(store, workspaceId));
        const view = buildView(record, []);
        const removed = new Set(descendantIds(view, sourceId));
        if (sourceId === targetId || removed.has(targetId)) {
          showNotice(t('mergeSelf'));
          setMergeFrom(null);
          return;
        }
        const removedFolders = record.folders.filter((folder) => removed.has(folder.id));
        const movedAssignments = [];
        for (const key of Object.keys(record.assignments)) {
          if (removed.has(record.assignments[key])) movedAssignments.push([key, record.assignments[key]]);
        }
        let targetName = '';
        for (const folder of record.folders) {
          if (folder.id === targetId) targetName = folderNameOf(folder, t);
        }
        mutateProject(workspaceId, (current) => {
          const assignments = { ...current.assignments };
          for (const pair of movedAssignments) assignments[pair[0]] = targetId;
          return {
            folders: current.folders.filter((folder) => !removed.has(folder.id)),
            assignments,
          };
        });
        setMergeFrom(null);
        setUndo({
          workspaceId,
          folders: removedFolders,
          assignments: movedAssignments,
          name: targetName,
          label: t('mergeDone').split('{name}').join(targetName),
        });
      };

      /** 删掉所有没有任何对话归类的分类（有归档对话的算「在用」，不删）。 */
      const cleanEmptyFolders = (workspaceId) => {
        const record = normalizeRecord(projectRecord(store, workspaceId));
        const view = buildView(record, []);
        const used = new Set();
        for (const key of Object.keys(record.assignments)) used.add(record.assignments[key]);
        const doomed = [];
        for (const folder of record.folders) {
          let taken = 0;
          for (const id of descendantIds(view, folder.id)) {
            if (used.has(id)) taken++;
          }
          if (taken === 0) doomed.push(folder);
        }
        if (doomed.length === 0) {
          showNotice(t('cleanEmptyNone'));
          return;
        }
        const removed = new Set();
        for (const folder of doomed) removed.add(folder.id);
        mutateProject(workspaceId, (current) => {
          const assignments = {};
          for (const key of Object.keys(current.assignments)) {
            if (!removed.has(current.assignments[key])) assignments[key] = current.assignments[key];
          }
          return {
            folders: current.folders.filter((folder) => !removed.has(folder.id)),
            assignments,
          };
        });
        setUndo({
          workspaceId,
          folders: doomed,
          assignments: [],
          name: '',
          label: t('cleanEmptyDone').split('{count}').join(String(doomed.length)),
        });
      };

      const toggleExpand = (folderId) => {
        setCollapsed((current) => ({ ...current, [folderId]: current[folderId] !== true }));
      };

      /** 全部展开：清空折叠表。 */
      const expandAllFolders = () => setCollapsed({});

      /** 全部折叠：把当前项目的每个分类都标记成折叠。 */
      const collapseAllFolders = () => {
        if (activeView === null) return;
        const next = {};
        for (const folder of activeView.folders) next[folder.id] = true;
        setCollapsed(next);
      };

      const toggleSelect = (workspaceId, sessionId) => {
        const key = workspaceId + '|' + sessionId;
        setSelection((current) => {
          const next = { ...current };
          if (next[key] === true) delete next[key];
          else next[key] = true;
          return next;
        });
      };

      let selectedCount = 0;
      for (const key of Object.keys(selection)) if (selection[key] === true) selectedCount++;

      const clearSelection = () => setSelection({});

      const groupedSelection = () => {
        const groups = new Map();
        for (const key of Object.keys(selection)) {
          if (selection[key] !== true) continue;
          const parts = key.split('|');
          const list = groups.get(parts[0]);
          if (list === undefined) groups.set(parts[0], [parts[1]]);
          else list.push(parts[1]);
        }
        return groups;
      };

      const batchAssign = (folderId) => {
        for (const entry of groupedSelection()) {
          const workspaceId = entry[0];
          const ids = entry[1];
          mutateProject(workspaceId, (record) => {
            const assignments = { ...record.assignments };
            for (const sessionId of ids) {
              if (folderId === null) delete assignments[sessionId];
              else assignments[sessionId] = folderId;
            }
            return { ...record, assignments };
          });
        }
        clearSelection();
      };

      const batchArchive = () => {
        for (const entry of groupedSelection()) {
          for (const sessionId of entry[1]) archiveOne(entry[0], sessionId);
        }
        clearSelection();
      };

      const batchRestore = () => {
        for (const entry of groupedSelection()) {
          for (const sessionId of entry[1]) restoreOne(sessionId);
        }
        clearSelection();
      };

      const addProject = () => {
        setBusy(true);
        Promise.resolve(bridge.addWorkspace()).then((outcome) => {
          setBusy(false);
          const result = outcome === undefined || outcome === null ? {} : outcome;
          if (result.error) showNotice(t('failed') + ': ' + String(result.error));
        });
      };

      // ---- 拖拽 ----------------------------------------------------------

      const startDrag = (event, payload) => {
        dragRef.current = payload;
        try {
          event.dataTransfer.setData('text/plain', payload);
          event.dataTransfer.effectAllowed = 'move';
        } catch (error) {
          console.warn('[workspace-manager] drag payload failed', error);
        }
      };

      const endDrag = () => {
        dragRef.current = '';
        setDragOver('');
      };

      const dragOverRow = (event, key) => {
        if (dragRef.current === '') return;
        event.preventDefault();
        try {
          event.dataTransfer.dropEffect = 'move';
        } catch (error) {
          /* 不是所有浏览器都会在这里给出 dropEffect */
        }
        if (dragOver !== key) setDragOver(key);
      };

      const dropOnFolder = (workspaceId, folderId) => {
        const payload = dragRef.current;
        dragRef.current = '';
        setDragOver('');
        if (payload === '') return;
        const parts = payload.split('|');
        if (parts[0] === 'session' && parts[1] === workspaceId) assignOne(workspaceId, parts[2], folderId);
        else if (parts[0] === 'folder' && parts[1] === workspaceId && parts[2] !== folderId) {
          moveFolderParent(workspaceId, parts[2], folderId);
        }
      };

      const dropOnRoot = (workspaceId) => {
        const payload = dragRef.current;
        dragRef.current = '';
        setDragOver('');
        if (payload === '') return;
        const parts = payload.split('|');
        if (parts[0] === 'session' && parts[1] === workspaceId) assignOne(workspaceId, parts[2], null);
        else if (parts[0] === 'folder' && parts[1] === workspaceId) moveFolderParent(workspaceId, parts[2], null);
      };

      // ---- 行模型（把数据摊平成可渲染的行） ------------------------------

      const rowList = [];
      const navKeys = [];

      const pushSession = (project, session, depth, folderId, mode) => {
        const sessionId = sessionIdOf(session);
        const key = 's|' + project.workspaceId + '|' + sessionId;
        rowList.push({ kind: 'session', key, depth, project, session, folderId, mode });
        navKeys.push(key);
        if (menu !== null && menu !== undefined
          && menu.workspaceId === project.workspaceId && menu.sessionId === sessionId) {
          rowList.push({
            kind: 'sessionMenu', key: 'm|' + project.workspaceId + '|' + sessionId,
            depth: depth + 1, project, session,
          });
        }
      };

      const pushFolderRows = (view, project, folder, depth) => {
        const expanded = collapsed[folder.id] !== true || needle !== '';
        rowList.push({
          kind: 'folder', key: 'f|' + project.workspaceId + '|' + folder.id, depth,
          project, folder, expanded, count: countFolder(view, folder.id),
        });
        navKeys.push('f|' + project.workspaceId + '|' + folder.id);
        if (iconPicker !== null && iconPicker !== undefined
          && iconPicker.workspaceId === project.workspaceId && iconPicker.folderId === folder.id) {
          rowList.push({ kind: 'icons', key: 'i|' + folder.id, depth: depth + 1, project, folder });
        }
        if (colorPicker !== null && colorPicker !== undefined
          && colorPicker.workspaceId === project.workspaceId && colorPicker.folderId === folder.id) {
          rowList.push({ kind: 'colors', key: 'c|' + folder.id, depth: depth + 1, project, folder });
        }
        if (editor !== null && editor !== undefined
          && editor.workspaceId === project.workspaceId && editor.folderId === folder.id) {
          rowList.push({ kind: 'editor', key: 'e|rename|' + folder.id, depth: depth + 1, project, mode: 'rename' });
        }
        if (!expanded) return;
        for (const session of sortSessions(asArray(view.bucket.get(folder.id)), sortMode)) {
          pushSession(project, session, depth + 1, folder.id, 'folder');
        }
        for (const child of asArray(view.children.get(folder.id))) pushFolderRows(view, project, child, depth + 1);
        if (creating !== null && creating !== undefined
          && creating.workspaceId === project.workspaceId && creating.parentId === folder.id) {
          rowList.push({ kind: 'editor', key: 'e|create|' + folder.id, depth: depth + 1, project, mode: 'create' });
        }
      };

      let headerTitle = t('title');
      let headerMeta = t('sub');
      let headerCount = 0;

      if (viewKind === 'project') {
        if (activeProject !== null && activeView !== null) {
          headerTitle = String(activeProject.title === undefined || activeProject.title === ''
            ? t('untitledFolder') : activeProject.title);
          headerMeta = String(activeProject.path === undefined ? '' : activeProject.path);
          headerCount = activeSessions.length;
          if (manageMode === true) {
            // ---- 分类管理：当前项目的全部分类，平铺排列，顺序同树
            headerMeta = t('manageHint');
            const ordered = orderedFolders(activeView);
            rowList.push({ kind: 'mhead', key: 'mhead' });
            for (const entry of ordered) {
              const folder = entry.folder;
              const key = 'g|' + activeProject.workspaceId + '|' + folder.id;
              rowList.push({
                kind: 'manageFolder', key, depth: entry.depth,
                project: activeProject, folder, count: countFolder(activeView, folder.id),
              });
              navKeys.push(key);
              if (iconPicker !== null && iconPicker !== undefined
                && iconPicker.workspaceId === activeProject.workspaceId && iconPicker.folderId === folder.id) {
                rowList.push({
                  kind: 'icons', key: 'i|' + folder.id, depth: entry.depth,
                  project: activeProject, folder,
                });
              }
              if (colorPicker !== null && colorPicker !== undefined
                && colorPicker.workspaceId === activeProject.workspaceId && colorPicker.folderId === folder.id) {
                rowList.push({
                  kind: 'colors', key: 'c|' + folder.id, depth: entry.depth,
                  project: activeProject, folder,
                });
              }
              if (editor !== null && editor !== undefined
                && editor.workspaceId === activeProject.workspaceId && editor.folderId === folder.id) {
                rowList.push({
                  kind: 'editor', key: 'e|rename|' + folder.id, depth: entry.depth,
                  project: activeProject, mode: 'rename',
                });
              }
              if (creating !== null && creating !== undefined
                && creating.workspaceId === activeProject.workspaceId && creating.parentId === folder.id) {
                rowList.push({
                  kind: 'editor', key: 'e|create|' + folder.id, depth: entry.depth + 1,
                  project: activeProject, mode: 'create',
                });
              }
            }
            if (creating !== null && creating !== undefined
              && creating.workspaceId === activeProject.workspaceId && creating.parentId === null) {
              rowList.push({ kind: 'editor', key: 'e|create|root', depth: 0, project: activeProject, mode: 'create' });
            }
            if (ordered.length === 0) {
              rowList.push({ kind: 'empty', key: 'empty', text: needle === '' ? t('noFolders') : t('noMatch') });
            }
          } else {
            const rootFolders = asArray(activeView.children.get(null));
            if (activeView.loose.length > 0 || rootFolders.length > 0) {
              rowList.push({
                kind: 'rootzone', key: 'z|' + activeProject.workspaceId, depth: 0,
                project: activeProject, count: activeView.loose.length,
              });
            }
            for (const session of activeView.loose) pushSession(activeProject, session, 1, null, 'root');
            for (const folder of rootFolders) pushFolderRows(activeView, activeProject, folder, 0);
            if (creating !== null && creating !== undefined
              && creating.workspaceId === activeProject.workspaceId && creating.parentId === null) {
              rowList.push({ kind: 'editor', key: 'e|create|root', depth: 0, project: activeProject, mode: 'create' });
            }
            if (rowList.length === 0) {
              rowList.push({ kind: 'empty', key: 'empty', text: needle === '' ? t('noSessions') : t('noMatch') });
            }
          }
        } else {
          rowList.push({ kind: 'empty', key: 'empty', text: t('empty'), hint: t('emptyHint') });
        }
      } else if (viewKind === 'unfiled') {
        headerTitle = t('unfiled');
        headerMeta = t('dropHint');
        headerCount = looseAll.length;
        for (const entry of looseAll) pushSession(entry.project, entry.session, 0, null, 'unfiled');
        if (rowList.length === 0) {
          rowList.push({ kind: 'empty', key: 'empty', text: needle === '' ? t('unfiledEmpty') : t('noMatch') });
        }
      } else {
        headerTitle = t('archivedView');
        headerMeta = t('countSessions');
        headerCount = archivedRows.length;
        for (const entry of archivedRows) {
          const key = 'a|' + (entry.project ? entry.project.workspaceId : '') + '|' + entry.sessionId;
          rowList.push({
            kind: 'archived', key, depth: 0, project: entry.project,
            session: entry.session, sessionId: entry.sessionId,
          });
          navKeys.push(key);
        }
        if (rowList.length === 0) {
          rowList.push({ kind: 'empty', key: 'empty', text: t('archivedEmpty') });
        }
      }

      if (needle !== '') {
        const kept = [];
        for (const row of rowList) {
          if (row.kind === 'session' || row.kind === 'archived') {
            if (sessionTitle(row.session, t).toLowerCase().indexOf(needle) >= 0) kept.push(row);
          } else if (row.kind === 'folder' || row.kind === 'manageFolder') {
            if (folderNameOf(row.folder, t).toLowerCase().indexOf(needle) >= 0) kept.push(row);
          } else if (row.kind === 'mhead') {
            kept.push(row);
          }
        }
        rowList.length = 0;
        for (const row of kept) rowList.push(row);
        if (rowList.length === 0) rowList.push({ kind: 'empty', key: 'empty', text: t('noMatch') });
        navKeys.length = 0;
        for (const row of rowList) {
          if (row.kind === 'session' || row.kind === 'folder' || row.kind === 'archived'
            || row.kind === 'manageFolder') navKeys.push(row.key);
        }
      }

      // ---- 键盘 ----------------------------------------------------------

      const moveFocus = (direction) => {
        if (navKeys.length === 0) return;
        let index = navKeys.indexOf(focused);
        if (index < 0) index = direction > 0 ? -1 : navKeys.length;
        let next = index + direction;
        if (next < 0) next = 0;
        if (next >= navKeys.length) next = navKeys.length - 1;
        setFocused(navKeys[next]);
      };

      const activateFocused = () => {
        if (focused === '') return;
        const parts = focused.split('|');
        if (parts[0] === 's') openSession(parts[2]);
        else if (parts[0] === 'a') restoreOne(parts[2]);
        else if (parts[0] === 'f') toggleExpand(parts[2]);
        else if (parts[0] === 'g') {
          const record = projectRecord(store, parts[1]);
          for (const folder of record.folders) {
            if (folder.id === parts[2]) beginRename(parts[1], folder);
          }
        }
      };

      handlerRef.current = (event) => {
        const target = event.target;
        const tag = target && target.tagName ? String(target.tagName).toUpperCase() : '';
        const inField = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
        const key = event.key;
        const primary = event.ctrlKey === true || event.metaKey === true;
        if (primary && (key === 'k' || key === 'K')) {
          event.preventDefault();
          if (searchRef.current) searchRef.current.focus();
          return;
        }
        if (primary && (key === 'z' || key === 'Z')) {
          if (undo !== null) {
            event.preventDefault();
            applyUndo();
          }
          return;
        }
        if (inField) {
          if (key === 'Escape') target.blur();
          return;
        }
        if (key === 'ArrowDown') {
          event.preventDefault();
          moveFocus(1);
          return;
        }
        if (key === 'ArrowUp') {
          event.preventDefault();
          moveFocus(-1);
          return;
        }
        if (key === 'ArrowRight' || key === 'ArrowLeft') {
          if (focused !== '' && focused.charAt(0) === 'f') {
            const parts = focused.split('|');
            const isCollapsed = collapsed[parts[2]] === true;
            const wantExpanded = key === 'ArrowRight';
            if (isCollapsed === wantExpanded) toggleExpand(parts[2]);
            event.preventDefault();
          }
          return;
        }
        if (key === 'Enter') {
          event.preventDefault();
          activateFocused();
          return;
        }
        if (key === 'F2') {
          if (focused !== '' && (focused.charAt(0) === 'f' || focused.charAt(0) === 'g')) {
            const parts = focused.split('|');
            const record = projectRecord(store, parts[1]);
            for (const folder of record.folders) {
              if (folder.id === parts[2]) beginRename(parts[1], folder);
            }
          }
          return;
        }
        if (key === 'Escape') {
          if (query !== '') setQuery('');
          else if (selectedCount > 0) clearSelection();
        }
      };

      React.useEffect(() => {
        const listener = (event) => {
          if (handlerRef.current) handlerRef.current(event);
        };
        window.addEventListener('keydown', listener);
        return () => window.removeEventListener('keydown', listener);
      }, []);

      React.useEffect(() => {
        if (notice === null) return undefined;
        const timer = window.setTimeout(() => setNotice(null), 6000);
        return () => window.clearTimeout(timer);
      }, [notice]);

      React.useEffect(() => {
        if (pending === null) return undefined;
        const timer = window.setTimeout(() => setPending(null), 5000);
        return () => window.clearTimeout(timer);
      }, [pending]);

      React.useEffect(() => {
        if (undo === null) return undefined;
        const timer = window.setTimeout(() => setUndo(null), 12000);
        return () => window.clearTimeout(timer);
      }, [undo]);

      React.useEffect(() => {
        setArmed(false);
      }, [menu]);

      React.useEffect(() => {
        if (armed !== true) return undefined;
        const timer = window.setTimeout(() => setArmed(false), 5000);
        return () => window.clearTimeout(timer);
      }, [armed]);

      React.useEffect(() => {
        setMenu(null);
        setArmed(false);
        setMergeFrom(null);
      }, [viewKind, activeProjectId]);

      // ---- 渲染 ----------------------------------------------------------

      const indent = (depth) => ({ paddingLeft: 8 + depth * 14 });

      /** 提示的显示/隐藏：位置跟着指针，但显示在指针上方 14px。 */
      const tipShow = (text) => (event) => {
        if (typeof text !== 'string' || text === '') return;
        const x = typeof event.clientX === 'number' ? event.clientX : 0;
        const y = typeof event.clientY === 'number' ? event.clientY : 0;
        setTip({ text, x, y });
      };
      const tipHide = () => setTip(null);
      /** 给按钮用：鼠标进入/移动更新位置，离开清掉；不再用原生 title（原生提示会被指针挡住）。 */
      const tipProps = (text) => ({
        'data-tip': text,
        onMouseEnter: tipShow(text),
        onMouseMove: tipShow(text),
        onMouseLeave: tipHide,
        onBlur: tipHide,
      });

      /** 分类行的整条底色：选了颜色就整条染色 + 左侧一条色带，标题本身不变色。 */
      const folderRowStyle = (folder, depth, focusedNow) => {
        const base = indent(depth);
        const paint = PALETTE[folder.color];
        if (paint === '' || paint === undefined) return base;
        const shadows = ['inset ' + Math.round(3 * scaleK) + 'px 0 0 ' + paint];
        if (focusedNow === true) shadows.push('inset 0 0 0 1px var(--wm-accent)');
        return Object.assign({}, base, {
          background: 'color-mix(in srgb, ' + paint + ' 18%, transparent)',
          boxShadow: shadows.join(','),
        });
      };

      const renderRow = (row, index) => {
        if (row.kind === 'empty') {
          return h('div', { className: 'wm-empty', key: row.key },
            h('div', null, row.text),
            row.hint ? h('div', { style: { marginTop: 6 } }, row.hint) : null);
        }

        if (row.kind === 'rootzone') {
          return h('div', {
            className: 'wm-row wm-row-head' + (dragOver === row.key ? ' wm-row-drop' : ''),
            key: row.key,
            style: indent(0),
            onDragOver: (event) => dragOverRow(event, row.key),
            onDragLeave: () => setDragOver(''),
            onDrop: (event) => {
              event.preventDefault();
              dropOnRoot(row.project.workspaceId);
            },
          },
          h('span', { className: 'wm-name' }, t('rootZone')),
          h('span', { className: 'wm-badge' }, String(row.count)),
          h('span', { className: 'wm-grow' }),
          h('span', { className: 'wm-meta' }, t('dropHint')));
        }

        if (row.kind === 'mhead') {
          return h('div', { className: 'wm-row wm-row-head wm-mhead', key: row.key },
            h('span', { className: 'wm-glyph' }, h(FolderGlyph, null)),
            h('span', { className: 'wm-mhead-name' }, t('colName')),
            h('span', { className: 'wm-badge' }, t('colCount')),
            h('span', { className: 'wm-grow' }),
            h('span', { className: 'wm-mhead-col' }, t('colParent')),
            h('span', { className: 'wm-mhead-col-right' }, t('colActions')));
        }

        if (row.kind === 'manageFolder') {
          const folder = row.folder;
          const workspaceId = row.project.workspaceId;
          const color = PALETTE[folder.color];
          const isPending = pending === folder.id;
          const merging = mergeFrom !== null && mergeFrom !== undefined
            && mergeFrom.workspaceId === workspaceId && mergeFrom.folderId === folder.id;
          const blocked = new Set(descendantIds(activeView, folder.id));
          const candidates = orderedFolders(activeView).filter((entry) => !blocked.has(entry.folder.id));
          const parentOptions = [h('option', { value: UNCATEGORIZED, key: '__top' }, t('topLevel'))];
          for (const entry of candidates) {
            parentOptions.push(h('option', { value: entry.folder.id, key: entry.folder.id },
              '　'.repeat(entry.depth) + folderNameOf(entry.folder, t)));
          }
          const mergeRow = merging === true ? h('select', {
            className: 'wm-select', key: 'merge', defaultValue: '',
            ...tipProps(t('merge')), 'aria-label': t('merge'),
            onClick: (event) => event.stopPropagation(),
            onChange: (event) => {
              const value = event.target.value;
              if (value === '') return;
              mergeFolder(workspaceId, folder.id, value);
            },
          },
          [h('option', { value: '', key: '__pick' }, t('mergePick'))].concat(candidates.map(
            (entry) => h('option', { value: entry.folder.id, key: entry.folder.id },
              '　'.repeat(entry.depth) + folderNameOf(entry.folder, t)),
          ))) : null;
          return h('div', {
            className: 'wm-row' + (index > 0 ? ' wm-row-sep' : '')
              + (focused === row.key ? ' wm-row-focus' : ''),
            key: row.key,
            style: folderRowStyle(folder, row.depth, focused === row.key),
            onClick: () => setFocused(row.key),
          },
          folder.icon !== ''
            ? h('button', {
              className: 'wm-emoji' + (isSvgIcon(folder.icon) ? ' wm-emoji-svg' : ''), type: 'button', ...tipProps(t('icon')),
              onClick: (event) => {
                event.stopPropagation();
                setIconPicker({ workspaceId, folderId: folder.id });
              },
            }, isSvgIcon(folder.icon) ? svgIcon(folder.icon.slice(SVG_ICON_PREFIX.length)) : folder.icon)
            : h('span', { className: 'wm-glyph' }, h(FolderGlyph, null)),
          h('button', {
            className: 'wm-dot', type: 'button', ...tipProps(t('colorPick')),
            style: color === '' ? undefined : { background: color, borderColor: color },
            onClick: (event) => {
              event.stopPropagation();
              setColorPicker({ workspaceId, folderId: folder.id });
            },
          }),
          h('button', {
            className: 'wm-name wm-name-link wm-name-folder wm-manage-name', type: 'button',
            ...tipProps(t('rename')),
            onClick: (event) => {
              event.stopPropagation();
              beginRename(workspaceId, folder);
            },
          }, folderNameOf(folder, t)),
          folder.pinned === true ? h('span', { className: 'wm-meta' }, '📌') : null,
          h('button', {
            className: 'wm-badge wm-badge-btn', type: 'button',
            ...tipProps(t('viewHint') + ' · ' + String(row.count) + ' ' + t('countSessions')),
            onClick: (event) => {
              event.stopPropagation();
              revealFolder(workspaceId, folder.id);
            },
          }, String(row.count)),
          h('span', { className: 'wm-grow' }),
          h('select', {
            className: 'wm-select wm-select-parent',
            value: folder.parentId === null ? UNCATEGORIZED : folder.parentId,
            title: t('colParent'), 'aria-label': t('colParent'),
            onClick: (event) => event.stopPropagation(),
            onChange: (event) => moveFolderParent(workspaceId, folder.id,
              event.target.value === UNCATEGORIZED ? null : event.target.value),
          }, parentOptions),
          mergeRow,
          h('span', { className: 'wm-actions wm-actions-show' },
            h('button', {
              className: 'wm-ghost', type: 'button', ...tipProps(t('viewHint')),
              onClick: (event) => {
                event.stopPropagation();
                revealFolder(workspaceId, folder.id);
              },
            }, t('view')),
            h('button', {
              className: 'wm-ghost', type: 'button', ...tipProps(t('siblingUp')),
              onClick: (event) => {
                event.stopPropagation();
                moveSibling(workspaceId, folder, -1);
              },
            }, '▲'),
            h('button', {
              className: 'wm-ghost', type: 'button', ...tipProps(t('siblingDown')),
              onClick: (event) => {
                event.stopPropagation();
                moveSibling(workspaceId, folder, 1);
              },
            }, '▼'),
            h('button', {
              className: 'wm-ghost', type: 'button', ...tipProps(t('addSub')),
              onClick: (event) => {
                event.stopPropagation();
                beginNewFolder(workspaceId, folder.id);
              },
            }, '＋'),
            h('button', {
              className: 'wm-ghost', type: 'button', ...tipProps(t('icon')),
              onClick: (event) => {
                event.stopPropagation();
                setIconPicker({ workspaceId, folderId: folder.id });
              },
            }, '🎨'),
            h('button', {
              className: 'wm-ghost', type: 'button',
              ...tipProps(folder.pinned === true ? t('unpin') : t('pin')),
              onClick: (event) => {
                event.stopPropagation();
                setFolderMeta(workspaceId, folder.id, { pinned: folder.pinned !== true });
              },
            }, folder.pinned === true ? '📌' : '📍'),
            h('span', { className: 'wm-actsep' }),
            h('button', {
              className: 'wm-ghost' + (merging === true ? ' wm-row-hit' : ''), type: 'button',
              ...tipProps(t('merge')),
              onClick: (event) => {
                event.stopPropagation();
                setMergeFrom(merging === true ? null : { workspaceId, folderId: folder.id });
              },
            }, '⤵'),
            h('button', {
              className: 'wm-ghost wm-ghost-danger', type: 'button',
              ...tipProps(isPending ? t('confirm') : t('remove')),
              onClick: (event) => {
                event.stopPropagation();
                deleteFolder(workspaceId, folder);
              },
            }, isPending ? '!' : '×')));
        }

        if (row.kind === 'folder') {
          const folder = row.folder;
          const color = PALETTE[folder.color];
          const isPending = pending === folder.id;
          return h('div', {
            className: 'wm-row wm-row-folder' + (index > 0 ? ' wm-row-sep' : '')
              + (dragOver === row.key ? ' wm-row-drop' : '')
              + (focused === row.key ? ' wm-row-focus' : ''),
            key: row.key,
            'data-nav-key': row.key,
            style: folderRowStyle(folder, row.depth, focused === row.key),
            draggable: true,
            onDragStart: (event) => startDrag(event, 'folder|' + row.project.workspaceId + '|' + folder.id),
            onDragEnd: endDrag,
            onDragOver: (event) => dragOverRow(event, row.key),
            onDragLeave: () => setDragOver(''),
            onDrop: (event) => {
              event.preventDefault();
              event.stopPropagation();
              dropOnFolder(row.project.workspaceId, folder.id);
            },
            onClick: () => setFocused(row.key),
          },
          h('button', {
            className: 'wm-chev', type: 'button',
            ...tipProps(row.expanded ? t('collapse') : t('expand')),
            'aria-label': row.expanded ? t('collapse') : t('expand'),
            onClick: (event) => {
              event.stopPropagation();
              toggleExpand(folder.id);
            },
          }, h(ChevronGlyph, { open: row.expanded })),
          folder.icon !== ''
            ? h('button', {
              className: 'wm-emoji' + (isSvgIcon(folder.icon) ? ' wm-emoji-svg' : ''), type: 'button', ...tipProps(t('icon')),
              onClick: (event) => {
                event.stopPropagation();
                setIconPicker({ workspaceId: row.project.workspaceId, folderId: folder.id });
              },
            }, isSvgIcon(folder.icon) ? svgIcon(folder.icon.slice(SVG_ICON_PREFIX.length)) : folder.icon)
            : h('span', { className: 'wm-glyph' }, h(FolderGlyph, null)),
          h('button', {
            className: 'wm-dot', type: 'button', ...tipProps(t('colorPick')),
            style: color === '' ? undefined : { background: color, borderColor: color },
            onClick: (event) => {
              event.stopPropagation();
              setColorPicker({ workspaceId: row.project.workspaceId, folderId: folder.id });
            },
          }),
          h('button', {
            className: 'wm-name wm-name-folder wm-name-toggle', type: 'button',
            ...tipProps((row.expanded ? t('collapse') : t('expand')) + ' · ' + folderNameOf(folder, t)),
            onClick: (event) => {
              event.stopPropagation();
              toggleExpand(folder.id);
            },
          }, folderNameOf(folder, t)),
          folder.pinned === true ? h('span', { className: 'wm-meta' }, '📌') : null,
          h('button', {
            className: 'wm-badge wm-badge-btn', type: 'button',
            ...tipProps((row.expanded ? t('collapse') : t('expand')) + ' · ' + String(row.count) + ' ' + t('countSessions')),
            onClick: (event) => {
              event.stopPropagation();
              toggleExpand(folder.id);
            },
          }, String(row.count)),
          h('span', { className: 'wm-grow' }),
          h('span', { className: 'wm-actions' },
            h('button', {
              className: 'wm-ghost', type: 'button', ...tipProps(t('siblingUp')),
              onClick: (event) => {
                event.stopPropagation();
                moveSibling(row.project.workspaceId, folder, -1);
              },
            }, '▲'),
            h('button', {
              className: 'wm-ghost', type: 'button', ...tipProps(t('siblingDown')),
              onClick: (event) => {
                event.stopPropagation();
                moveSibling(row.project.workspaceId, folder, 1);
              },
            }, '▼'),
            h('button', {
              className: 'wm-ghost', type: 'button', ...tipProps(t('addSub')),
              onClick: (event) => {
                event.stopPropagation();
                beginNewFolder(row.project.workspaceId, folder.id);
              },
            }, '＋'),
            h('button', {
              className: 'wm-ghost', type: 'button', ...tipProps(t('icon')),
              onClick: (event) => {
                event.stopPropagation();
                setIconPicker({ workspaceId: row.project.workspaceId, folderId: folder.id });
              },
            }, '🎨'),
            h('button', {
              className: 'wm-ghost', type: 'button', ...tipProps(t('rename')),
              onClick: (event) => {
                event.stopPropagation();
                beginRename(row.project.workspaceId, folder);
              },
            }, '✎'),
            h('button', {
              className: 'wm-ghost', type: 'button',
              ...tipProps(folder.pinned === true ? t('unpin') : t('pin')),
              onClick: (event) => {
                event.stopPropagation();
                setFolderMeta(row.project.workspaceId, folder.id, { pinned: folder.pinned !== true });
              },
            }, folder.pinned === true ? '📌' : '📍'),
            h('button', {
              className: 'wm-ghost', type: 'button', ...tipProps(t('newSession')),
              onClick: (event) => {
                event.stopPropagation();
                newSession(row.project.workspaceId, folder.id);
              },
            }, '◆'),
            h('span', { className: 'wm-actsep' }),
            h('button', {
              className: 'wm-ghost wm-ghost-danger', type: 'button',
              ...tipProps(isPending ? t('confirm') : t('remove')),
              onClick: (event) => {
                event.stopPropagation();
                deleteFolder(row.project.workspaceId, folder);
              },
            }, isPending ? '!' : '×')));
        }

        if (row.kind === 'colors') {
          const folder = row.folder;
          const swatches = PALETTE.map((paint, index) => h('button', {
            type: 'button', key: 'p' + index,
            className: 'wm-swatch' + (folder.color === index ? ' wm-swatch-active' : ''),
            ...tipProps(paint === '' ? t('clearColor') : paint),
            style: paint === '' ? undefined : { background: paint, borderColor: paint, color: '#fff' },
            onClick: (event) => {
              event.stopPropagation();
              setFolderMeta(row.project.workspaceId, folder.id, { color: index });
              setColorPicker(null);
            },
          }, paint === '' ? '∅' : ''));
          return h('div', { className: 'wm-colors', key: row.key, style: indent(row.depth) },
            h('span', { className: 'wm-colorlabel' }, t('colorPick')),
            h('span', { className: 'wm-colorgrid' }, swatches));
        }

        if (row.kind === 'icons') {
          const folder = row.folder;
          const pick = (icon) => (event) => {
            event.stopPropagation();
            setFolderMeta(row.project.workspaceId, folder.id, { icon });
            setIconPicker(null);
          };
          const groups = ICON_GROUPS.map((group) => h('div', {
            className: 'wm-iconrow', key: group.key,
          },
          h('span', { className: 'wm-iconlabel' }, t(group.labelKey)),
          h('span', { className: 'wm-icongrid' }, group.icons.map((icon) => h('button', {
            type: 'button', key: group.key + '|' + icon, ...tipProps(icon), onClick: pick(icon),
          }, icon)))));
          for (const group of SVG_GROUPS) {
            groups.push(h('div', { className: 'wm-iconrow', key: group.key },
              h('span', { className: 'wm-iconlabel' }, t(group.labelKey)),
              h('span', { className: 'wm-icongrid' }, group.names.map((name) => h('button', {
                type: 'button', key: group.key + '|' + name, ...tipProps(name),
                className: 'wm-svgbtn' + (folder.icon === SVG_ICON_PREFIX + name ? ' wm-svgbtn-active' : ''),
                onClick: pick(SVG_ICON_PREFIX + name),
              }, svgIcon(name))))));
          }
          groups.push(h('div', { className: 'wm-iconrow', key: 'clear' },
            h('span', { className: 'wm-iconlabel' }, t('clearIcon')),
            h('span', { className: 'wm-icongrid' }, h('button', {
              type: 'button', key: 'clear', ...tipProps(t('clearIcon')), onClick: pick(''),
            }, '∅'))));
          return h('div', { className: 'wm-icons', key: row.key, style: indent(row.depth) }, groups);
        }

        if (row.kind === 'editor') {
          const source = row.mode === 'rename' ? editor : creating;
          if (source === null || source === undefined) return null;
          return h('div', { className: 'wm-editor', key: row.key, style: indent(row.depth) },
            h('span', { className: 'wm-glyph' }, h(FolderGlyph, null)),
            h('input', {
              className: 'wm-input',
              style: { width: 210 },
              autoFocus: true,
              value: source.value,
              placeholder: t('folderName'),
              'aria-label': t('folderName'),
              onChange: (event) => editValue(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitEditor();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  setCreating(null);
                  setEditor(null);
                }
              },
            }),
            h('button', { className: 'wm-btn wm-btn-sm wm-btn-primary', type: 'button', onClick: () => commitEditor() }, t('save')),
            h('button', {
              className: 'wm-btn wm-btn-sm', type: 'button',
              onClick: () => {
                setCreating(null);
                setEditor(null);
              },
            }, t('cancel')));
        }

        if (row.kind === 'sessionMenu') {
          const menuSessionId = sessionIdOf(row.session);
          return h('div', { className: 'wm-menuro', key: row.key, style: indent(row.depth) },
            h('span', { className: 'wm-meta wm-grow' }, t('archiveHint')),
            h('button', {
              className: 'wm-btn wm-btn-sm' + (armed ? ' wm-btn-danger' : ''),
              type: 'button',
              onClick: (event) => {
                event.stopPropagation();
                if (armed !== true) {
                  setArmed(true);
                  return;
                }
                setMenu(null);
                setArmed(false);
                archiveOne(row.project.workspaceId, menuSessionId);
              },
            }, armed === true ? t('archiveConfirm') : t('archive')),
            h('button', {
              className: 'wm-btn wm-btn-sm', type: 'button',
              onClick: (event) => {
                event.stopPropagation();
                setMenu(null);
                setArmed(false);
              },
            }, t('closeMenu')));
        }

        if (row.kind === 'archived') {
          const session = row.session;
          const title = session ? sessionTitle(session, t) : String(row.sessionId).slice(0, 8);
          const workspaceId = row.project ? row.project.workspaceId : '';
          const checked = selection[workspaceId + '|' + row.sessionId] === true;
          return h('div', {
            className: 'wm-card wm-row' + (focused === row.key ? ' wm-row-focus' : ''),
            key: row.key,
            style: indent(0),
            onClick: () => setFocused(row.key),
          },
          h('input', {
            className: 'wm-check', type: 'checkbox', checked,
            'aria-label': title,
            onClick: (event) => event.stopPropagation(),
            onChange: () => toggleSelect(workspaceId, row.sessionId),
          }),
          h('span', { className: 'wm-glyph' }, h(SessionGlyph, null)),
          h('span', { className: 'wm-name', title }, title),
          row.project ? h('span', { className: 'wm-chip' }, String(row.project.title || '')) : null,
          h('span', { className: 'wm-grow' }),
          h('button', {
            className: 'wm-btn wm-btn-sm', type: 'button',
            onClick: (event) => {
              event.stopPropagation();
              restoreOne(row.sessionId);
            },
          }, t('restore')));
        }

        const project = row.project;
        const session = row.session;
        const sessionId = sessionIdOf(session);
        const checked = selection[project.workspaceId + '|' + sessionId] === true;
        const time = formatTime(session.updatedAt !== undefined ? session.updatedAt
          : (session.createdAt !== undefined ? session.createdAt : session.time));
        const viewForOptions = row.mode === 'unfiled'
          ? buildView(projectRecord(store, project.workspaceId), projectSessions(project))
          : activeView;
        const folderOptions = viewForOptions ? flattenFolders(viewForOptions) : [];
        return h('div', {
          className: 'wm-row' + (focused === row.key ? ' wm-row-focus' : '') + (checked ? ' wm-row-hit' : ''),
          key: row.key,
          style: indent(row.depth),
          draggable: true,
          onDragStart: (event) => startDrag(event, 'session|' + project.workspaceId + '|' + sessionId),
          onDragEnd: endDrag,
          onClick: () => setFocused(row.key),
        },
        h('input', {
          className: 'wm-check', type: 'checkbox', checked,
          'aria-label': sessionTitle(session, t),
          onClick: (event) => event.stopPropagation(),
          onChange: () => toggleSelect(project.workspaceId, sessionId),
        }),
        h('span', { className: 'wm-glyph' }, h(SessionGlyph, null)),
        h('button', {
          className: 'wm-name wm-name-link', type: 'button',
          ...tipProps(t('clickToOpen')),
          onClick: (event) => {
            event.stopPropagation();
            openSession(sessionId);
          },
        }, sessionTitle(session, t)),
        row.mode === 'unfiled' && project ? h('span', { className: 'wm-chip' }, String(project.title || '')) : null,
        time !== '' ? h('span', { className: 'wm-meta' }, time) : null,
        h('span', { className: 'wm-grow' }),
        folderOptions.length > 0 ? h('select', {
          className: 'wm-select',
          value: row.folderId === null ? UNCATEGORIZED : row.folderId,
          title: t('moveTo'),
          'aria-label': t('moveTo'),
          onClick: (event) => event.stopPropagation(),
          onChange: (event) => assignOne(
            project.workspaceId,
            sessionId,
            event.target.value === UNCATEGORIZED ? null : event.target.value,
          ),
        },
        h('option', { value: UNCATEGORIZED }, t('uncategorized')),
        folderOptions.map((option) => h('option', { value: option.id, key: option.id }, option.label))) : null,
        h('span', { className: 'wm-actions' },
          h('button', {
            className: 'wm-ghost', type: 'button', ...tipProps(t('menu')),
            'aria-label': t('menu'),
            onClick: (event) => {
              event.stopPropagation();
              setMenu(menu !== null && menu !== undefined
                && menu.workspaceId === project.workspaceId && menu.sessionId === sessionId
                ? null
                : { workspaceId: project.workspaceId, sessionId });
            },
          }, '⋯')));
      };

      // ---- 左侧导航 ------------------------------------------------------

      const navItems = [];

      navItems.push(h('button', {
        className: 'wm-navit' + (viewKind === 'unfiled' ? ' wm-navit-active' : ''),
        type: 'button', key: 'unfiled',
        onClick: () => setPrefs({ activeKind: 'unfiled' }),
      },
      h('span', { className: 'wm-glyph' }, h(FolderGlyph, null)),
      h('span', { className: 'wm-navname' }, t('unfiled')),
      h('span', { className: 'wm-navcount' }, String(looseAll.length))));

      navItems.push(h('button', {
        className: 'wm-navit' + (viewKind === 'archived' ? ' wm-navit-active' : ''),
        type: 'button', key: 'archived',
        onClick: () => setPrefs({ activeKind: 'archived' }),
      },
      h('span', { className: 'wm-glyph' }, h(SessionGlyph, null)),
      h('span', { className: 'wm-navname' }, t('archivedView')),
      h('span', { className: 'wm-navcount' }, String(archivedIds.size))));

      for (const project of projects) {
        const isActive = viewKind === 'project' && project.workspaceId === activeProjectId;
        const navLabel = String(project.title === undefined || project.title === '' ? t('untitledFolder') : project.title);
        const navPath = String(project.path === undefined ? '' : project.path);
        navItems.push(h('button', {
          className: 'wm-navit' + (isActive ? ' wm-navit-active' : ''),
          type: 'button', key: 'p|' + project.workspaceId,
          // 悬停给出全名 + 磁盘路径：左栏再窄也能确认是哪个项目
          ...tipProps(navPath === '' ? navLabel : navLabel + '\n' + navPath),
          onClick: () => setPrefs({ activeKind: 'project', activeProjectId: project.workspaceId }),
        },
        h('span', { className: 'wm-glyph' }, h(FolderGlyph, null)),
        h('span', { className: 'wm-navname' }, navLabel),
        h('span', { className: 'wm-navcount' }, String(asArray(project.sessionIds).length))));
      }

      // ---- 页面骨架 ------------------------------------------------------

      // 右侧栏紧凑版顶部：项目下拉 + 待归类 / 归档 + 展开到主面板
      const paneBar = compact ? h('div', { className: 'wm-panebar' },
        h('select', {
          className: 'wm-select wm-pane-project',
          value: activeProjectId,
          title: t('title'), 'aria-label': t('title'),
          onChange: (event) => setPrefs({ activeKind: 'project', activeProjectId: event.target.value }),
        },
        projects.map((project) => h('option', { value: project.workspaceId, key: project.workspaceId },
          String(project.title === undefined || project.title === '' ? t('untitledFolder') : project.title)))),
        h('button', {
          className: 'wm-panechip' + (viewKind === 'unfiled' ? ' wm-panechip-active' : ''),
          type: 'button', ...tipProps(t('unfiled')),
          onClick: () => setPrefs({ activeKind: 'unfiled' }),
        }, t('unfiled') + ' ' + looseAll.length),
        h('button', {
          className: 'wm-panechip' + (viewKind === 'archived' ? ' wm-panechip-active' : ''),
          type: 'button', ...tipProps(t('archivedView')),
          onClick: () => setPrefs({ activeKind: 'archived' }),
        }, t('archivedView') + ' ' + archivedIds.size),
        h('button', {
          className: 'wm-panechip', type: 'button', ...tipProps(t('expandAllHint')),
          onClick: expandAllFolders,
        }, t('expandAll')),
        h('button', {
          className: 'wm-panechip', type: 'button', ...tipProps(t('collapseAllHint')),
          onClick: collapseAllFolders,
        }, t('collapseAll')),
        h('button', {
          className: 'wm-panechip', type: 'button', ...tipProps(t('openMain')),
          onClick: () => bridge.openPanel(),
        }, t('openMain'))) : null;

      const rows = rowList.map(renderRow);
      const canEditProject = viewKind === 'project' && activeProject !== null && activeView !== null;

      let batchBar = null;
      if (selectedCount > 0) {
        const controls = [];
        controls.push(h('span', { className: 'wm-meta', key: 'label' }, t('selected') + ' ' + selectedCount));
        if (viewKind === 'archived') {
          controls.push(h('button', {
            className: 'wm-btn wm-btn-sm', type: 'button', key: 'restore', onClick: batchRestore,
          }, t('restore')));
        } else {
          if (viewKind === 'project' && activeView) {
            controls.push(h('select', {
              className: 'wm-select', key: 'assign', defaultValue: '',
              'aria-label': t('assignTo'),
              onChange: (event) => {
                const value = event.target.value;
                if (value === '') return;
                batchAssign(value === UNCATEGORIZED ? null : value);
                event.target.value = '';
              },
            },
            h('option', { value: '' }, t('assignTo')),
            h('option', { value: UNCATEGORIZED }, t('uncategorized')),
            flattenFolders(activeView).map((option) => h('option', { value: option.id, key: option.id }, option.label))));
          }
          controls.push(h('button', {
            className: 'wm-btn wm-btn-sm', type: 'button', key: 'clear', onClick: clearSelection,
          }, t('clearSelection')));
          if (viewKind !== 'archived') {
            controls.push(h('span', { className: 'wm-grow', key: 'gap' }));
            // 归档是"移出列表"的破坏性动作，和上面的操作隔开，避免顺手点到
            controls.push(h('span', { className: 'wm-actsep', key: 'gap-sep' }));
            controls.push(h('button', {
              className: 'wm-btn wm-btn-sm', type: 'button', key: 'archive', ...tipProps(t('archiveHint')),
              onClick: batchArchive,
            }, t('archive')));
          }
        }
        batchBar = h('div', { className: 'wm-batch' }, controls);
      }

      if (workspaceSnapshot === undefined) {
        return h('div', { className: 'wm-root' + (compact ? ' wm-compact' : ''), style: rootStyle },
          h(StyleTag, null),
          h('div', { className: 'wm-empty' }, t('sub')));
      }

      return h('div', { className: 'wm-root' + (compact ? ' wm-compact' : ''), style: rootStyle },
        h(StyleTag, null),
        h('div', { className: 'wm-body' },
          compact ? null : h('div', { className: 'wm-nav', style: { width: navWidthPx + 'px' } },
            h('input', {
              className: 'wm-input wm-search',
              value: query,
              placeholder: t('search'),
              'aria-label': t('search'),
              ref: searchRef,
              onChange: (event) => setQuery(event.target.value),
            }),
            h('button', {
              className: 'wm-btn wm-btn-sm', type: 'button', disabled: busy,
              onClick: addProject,
              style: { width: '100%', justifyContent: 'center', marginBottom: 6 },
            }, t('addProject')),
            navItems),
          compact ? null : h('div', {
            className: 'wm-split' + (navDraft === null ? '' : ' wm-split-active'),
            role: 'separator',
            'aria-orientation': 'vertical',
            'aria-label': t('splitHint'),
            ...tipProps(t('splitHint')),
            tabIndex: 0,
            onPointerDown: splitDown,
            onPointerMove: splitMove,
            onPointerUp: splitUp,
            onPointerCancel: splitUp,
            onDoubleClick: splitReset,
            onKeyDown: splitKey,
          }),
          h('div', { className: 'wm-mainpane' },
            paneBar,
            h('div', { className: 'wm-head' },
              h('div', { className: 'wm-grow' },
                h('h2', { className: 'wm-title', title: headerTitle }, headerTitle),
                h('p', { className: 'wm-sub', title: headerMeta }, headerMeta)),
              h('button', {
                className: 'wm-btn', type: 'button',
                onClick: () => bridge.backToConversation(),
              }, t('back'))),
            h('div', { className: 'wm-toolbar' },
              canEditProject ? h('button', {
                className: 'wm-btn' + (manageMode === true ? ' wm-btn-primary' : ''), type: 'button',
                onClick: () => setPrefs({ manage: manageMode !== true }),
              }, manageMode === true ? t('manageBack') : t('manage')) : null,
              canEditProject && manageMode !== true ? h('button', {
                className: 'wm-btn wm-btn-primary', type: 'button',
                onClick: () => beginNewFolder(activeProject.workspaceId, null),
              }, t('addFolder')) : null,
              canEditProject && manageMode === true ? h('button', {
                className: 'wm-btn', type: 'button',
                onClick: () => beginNewFolder(activeProject.workspaceId, null),
              }, t('addFolder')) : null,
              canEditProject && manageMode === true ? h('button', {
                className: 'wm-btn', type: 'button',
                onClick: () => cleanEmptyFolders(activeProject.workspaceId),
              }, t('cleanEmpty')) : null,
              canEditProject && manageMode !== true ? h('button', {
                className: 'wm-btn', type: 'button', disabled: busy,
                onClick: () => newSession(activeProject.workspaceId, null),
              }, t('newSession')) : null,
              canEditProject && manageMode !== true ? h('select', {
                className: 'wm-select', value: sortMode,
                title: t('sortLabel'), 'aria-label': t('sortLabel'),
                onChange: (event) => setPrefs({ sort: event.target.value }),
              },
              h('option', { value: 'recent' }, t('sortRecent')),
              h('option', { value: 'title' }, t('sortTitle')),
              h('option', { value: 'created' }, t('sortCreated'))) : null,
              canEditProject && manageMode !== true ? h('button', {
                className: 'wm-btn wm-btn-sm', type: 'button', ...tipProps(t('expandAllHint')),
                onClick: expandAllFolders,
              }, t('expandAll')) : null,
              canEditProject && manageMode !== true ? h('button', {
                className: 'wm-btn wm-btn-sm', type: 'button', ...tipProps(t('collapseAllHint')),
                onClick: collapseAllFolders,
              }, t('collapseAll')) : null,
              bridge.canPin === true ? h('button', {
                className: 'wm-btn' + (prefs.autoPin !== false ? ' wm-btn-primary' : ''), type: 'button',
                ...tipProps(prefs.autoPin !== false ? t('pinOffHint') : t('pinHint')),
                onClick: () => {
                  const next = prefs.autoPin === false;
                  setPrefs({ autoPin: next });
                  if (!next) return;
                  const result = bridge.pin();
                  if (result === 'navigating') showNotice(t('pinNavigating'));
                },
              }, prefs.autoPin !== false ? t('pinOn') : t('pinPane')) : null,
              h('span', { className: 'wm-grow' }),
              // 界面大小三档：三个档位同时可见，点一下就切；改的是 --wm-k，字号/行高/按钮一起缩放
              h('div', {
                className: 'wm-scale',
                role: 'group',
                'aria-label': t('scaleLabel'),
                title: t('scaleLabel'),
              },
              SCALE_KEYS.map((key) => h('button', {
                className: 'wm-scalebtn' + (key === scaleKey ? ' wm-scalebtn-active' : ''),
                type: 'button', key,
                'aria-pressed': key === scaleKey,
                onClick: () => setPrefs({ scale: key }),
              }, t(SCALE_LABEL_KEYS[key])))),
              h('span', { className: 'wm-totals' },
                h('span', null, projects.length + ' ' + t('countProjects')),
                h('span', null, (activeView ? activeView.folders.length : 0) + ' ' + t('countFolders')),
                h('span', null, headerCount + ' ' + t('countSessions')))),
            notice !== null ? h('div', { className: 'wm-notice' }, notice) : null,
            undo !== null
              ? h('div', { className: 'wm-notice' },
                h('span', { className: 'wm-grow' }, typeof undo.label === 'string' && undo.label !== ''
                  ? undo.label
                  : t('undoDelete').split('{name}').join(undo.name)),
                h('button', { className: 'wm-btn wm-btn-sm', type: 'button', onClick: applyUndo }, t('undo')))
              : null,
            batchBar,
            h('div', { className: 'wm-scroll' }, rows),
            h('p', { className: 'wm-hint' }, t('storage'))),
        tip === null ? null : h('div', {
          className: 'wm-tip',
          role: 'tooltip',
          style: { left: Math.round(tip.x) + 'px', top: Math.round(tip.y) + 'px' },
        }, tip.text)));
    }

    // ------------------------------------------------------------ 生命周期

    const inject = ['slots', 'locale', 'layout', 'sessions', 'workspaces', 'uiWorkspace', 'sidebarRight', 'sidebarRightTabs'];

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'workspace-manager:dictionary');

      const translate = (key) => {
        let id = '';
        try {
          const snapshot = ctx.locale.getLocale();
          id = String((snapshot && (snapshot.id !== undefined ? snapshot.id : snapshot.locale)) || '');
        } catch (error) {
          id = '';
        }
        const dict = id.toLowerCase().indexOf('en') === 0 ? EN : ZH;
        if (Object.prototype.hasOwnProperty.call(dict, key)) return dict[key];
        return Object.prototype.hasOwnProperty.call(ZH, key) ? ZH[key] : key;
      };

      const bridge = {
        workspaces: ctx.workspaces.list,
        sessions: ctx.sessions.list,
        openSession: (sessionId) => {
          try {
            ctx.uiWorkspace.openSession(sessionId);
          } catch (error) {
            console.warn('[workspace-manager] cannot open the conversation', error);
          }
        },
        startSessionIn: async (workspaceId) => {
          try {
            return await ctx.uiWorkspace.connectWorkspace(workspaceId);
          } catch (error) {
            console.warn('[workspace-manager] cannot create a conversation', error);
            return null;
          }
        },
        archiveSession: async (sessionId) => {
          try {
            await ctx.uiWorkspace.archiveSession(sessionId);
            return null;
          } catch (error) {
            return messageOf(error);
          }
        },
        unarchiveSession: async (sessionId) => {
          try {
            await ctx.uiWorkspace.unarchiveSession(sessionId);
            return null;
          } catch (error) {
            return messageOf(error);
          }
        },
        addWorkspace: async () => {
          try {
            const path = await ctx.uiWorkspace.pickDirectory();
            if (typeof path !== 'string' || path === '') return { cancelled: true };
            await ctx.workspaces.create({ path });
            return {};
          } catch (error) {
            return { error: messageOf(error) };
          }
        },
        openPanel: () => {
          try {
            ctx.layout.selectPanel(PANEL_ID);
          } catch (error) {
            console.warn('[workspace-manager] cannot open the main panel', error);
          }
        },
        // 固定到右侧：右侧栏是按「会话」挂的，管理面板里没有会话上下文，
        // 所以先回对话页并展开右栏，稍后再让右栏落我们的标签页。
        pin: () => {
          const place = () => {
            try {
              ctx.sidebarRight.openTab(PANE_KIND);
              return true;
            } catch (error) {
              console.warn('[workspace-manager] cannot place the right tab yet', error);
              return false;
            }
          };
          if (place()) return 'opened';
          try {
            ctx.layout.selectPanel(null);
          } catch (error) {
            console.warn('[workspace-manager] cannot leave the panel', error);
          }
          try {
            if (typeof ctx.layout.openRightbar === 'function') ctx.layout.openRightbar(true, false);
          } catch (error) {
            console.warn('[workspace-manager] cannot expand the right bar', error);
          }
          window.setTimeout(() => {
            if (!place()) console.warn('[workspace-manager] right tab still unavailable: open a conversation first');
          }, 700);
          return 'navigating';
        },
        canPin: ctx.sidebarRight !== undefined && ctx.sidebarRight !== null
          && typeof ctx.sidebarRight.openTab === 'function',
        backToConversation: () => {
          try {
            ctx.layout.selectPanel(null);
          } catch (error) {
            console.warn('[workspace-manager] cannot leave the panel', error);
          }
        },
      };

      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: PANEL_ID,
        locale: NS,
        inject: () => ({ bridge, tr: translate }),
      }, PanelPage));

      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 20,
        locale: NS,
        label: () => translate('title'),
      }, PanelIcon));

      // ---- 右侧栏常驻标签页：打开对话不会被关掉
      const paneAvailable = ctx.sidebarRightTabs !== undefined && ctx.sidebarRightTabs !== null
        && typeof ctx.sidebarRightTabs.register === 'function';
      if (paneAvailable) {
        ctx.effect(() => ctx.sidebarRightTabs.register({
          id: PANE_ID,
          kind: PANE_KIND,
          priority: 'extension',
          title: () => translate('title'),
          guide: [{
            id: 'workspace-manager',
            order: 5,
            title: () => translate('title'),
            description: () => translate('paneGuide'),
            icon: PanelIcon,
          }],
        }), 'workspace-manager:pane tab type');

        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: PANE_ID,
          locale: NS,
        }, (paneProps) => h(PanelPage, Object.assign({}, paneProps, {
          bridge,
          t: translate,
          variant: 'pane',
        })))), 'workspace-manager:pane body');

        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab.title',
          key: PANE_ID,
        }, () => h('span', { className: 'wm-pane-title' }, translate('title')))), 'workspace-manager:pane title');
      }
    }

    return { inject, apply };
  },
});
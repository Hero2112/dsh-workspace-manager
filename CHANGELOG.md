# workspace-manager 版本记录

插件：`@local/workspace-manager` · 当前版本 **1.6.2** · 详细说明见 [`versions/`](versions/) · 源码仓库 [Hero2112/dsh-workspace-manager](https://github.com/Hero2112/dsh-workspace-manager)

| 版本 | 日期 | 类型 | 一句话 |
|---|---|---|---|
| [1.6.2](versions/v1.6.2.md) | 2026-11-26 | 体验改进 | 点对话时分类树自动挂到右侧栏，界面不再被关掉；按钮变成开关（默认开）
| [1.6.1](versions/v1.6.1.md) | 2026-11-26 | 缺陷修复 | 修「固定到右侧」点不动：右侧栏按会话挂，面板里没有会话上下文；改成先回对话页并展开右栏再落标签
| [1.6.0](versions/v1.6.0.md) | 2026-11-26 | 新增功能 | 固定到右侧栏：打开对话时分类树常驻，边聊边归类
| [1.5.0](versions/v1.5.0.md) | 2026-11-06 | 新增功能 | 分类图标从 12 个扩到约 120 个（8 组 emoji：常用/文档/数据/技术/媒体/工作/生活/标记），面板分组显示并可滚动
| [1.4.1](versions/v1.4.1.md) | 2026-11-06 | 体验改进 | 分类之间加一条明显的分隔线 + 组头留白 + 分类行淡底：展开一个分类后，它和下一个分类依然分得清
| [1.4.0](versions/v1.4.0.md) | 2026-11-06 | 新增功能 | 分类管理每行加「查看」：跳回对话视图、展开上级并选中该分类；点分类名或数字徽标也能收起/展开分类里的对话
| [1.3.3](versions/v1.3.3.md) | 2026-11-06 | 文案修正 | 左栏「收件箱」改名「待归类」（英文 To sort）：它不是"新收到的消息"，而是跨项目还没分类的对话汇总 |
| [1.3.2](versions/v1.3.2.md) | 2026-11-06 | 缺陷修复 + 体验改进 | 修掉暗色主题下「白字压近白品牌色」导致按钮文字隐形（1.05:1）；配色全部收进语义变量，hover/徽标/提示条/下拉列表统一提升对比度 |
| [1.3.1](versions/v1.3.1.md) | 2026-11-04 | 体验改进 | 界面大小从下拉改成三段按钮 `小|中|大`：三档同时可见、当前档高亮、一点即切 |
| [1.3.0](versions/v1.3.0.md) | 2026-11-04 | 新增功能 + 体验改进 | 界面大小三档（小/中/大，字号与行高一起缩放）、左栏宽度可拖动并记忆、项目悬停显示全名+路径 |
| [1.2.0](versions/v1.2.0.md) | 2026-11-03 | 新增功能 | 分类管理视图：平铺表格集中管理全部分类，支持改上级、合并、清理空分类、改名、调序、置顶、改色/图标，全部可撤销 |
| [1.1.0](versions/v1.1.0.md) | 2026-11-03 | 新增功能 + 安全改造 | 九项能力全量落地：双栏布局、拖拽归类、批量、文件夹配色/图标/置顶、收件箱、归档区、撤销、快捷键；并把「打开」与「归档」彻底分离 |
| [1.0.0](versions/v1.0.0.md) | 2026-11-03 | 初版 | 单列卡片视图：每个项目下的文件夹树 + 对话归类 + 新建/重命名/删除文件夹 + 打开/归档对话 |

## 归档位置

每个版本都有一份**冻结快照**（完整可安装）和一份分发包；快照发布后不再改动。

| 版本 | 冻结快照 | 分发包 | 版本文档 |
|---|---|---|---|
| 1.6.2 | `releases/v1.6.2/`（**当前安装**） | `dist/workspace-manager-1.6.2.zip`（36,487 B，SHA256 `4D79C30B…`） | [versions/v1.6.2.md](versions/v1.6.2.md) |`r`n| 1.6.1 | `releases/v1.6.1/`（可回滚） | `dist/workspace-manager-1.6.1.zip`（36,217 B，SHA256 `82A69035…`） | [versions/v1.6.1.md](versions/v1.6.1.md) |`r`n| 1.6.0 | `releases/v1.6.0/`（可回滚） | `dist/workspace-manager-1.6.0.zip`（35,699 B，SHA256 `089DF641…28D620`） | [versions/v1.6.0.md](versions/v1.6.0.md) |`r`n| 1.5.0 | `releases/v1.5.0/`（可回滚） | `dist/workspace-manager-1.5.0.zip`（34,397 B，SHA256 `1B19097F…FC3B74`） | [versions/v1.5.0.md](versions/v1.5.0.md) |`r`n| 1.4.1 | `releases/v1.4.1/`（可回滚） | `dist/workspace-manager-1.4.1.zip`（33,333 B，SHA256 `300EC17A…471967`） | [versions/v1.4.1.md](versions/v1.4.1.md) |`r`n| 1.4.0 | `releases/v1.4.0/`（可回滚） | `dist/workspace-manager-1.4.0.zip`（33,016 B，SHA256 `4ACCA241…F5FE45`） | [versions/v1.4.0.md](versions/v1.4.0.md) |
| 1.3.3 | `releases/v1.3.3/`（可回滚） | `dist/workspace-manager-1.3.3.zip`（32,182 B，SHA256 `C9502C26…39F093`） | [versions/v1.3.3.md](versions/v1.3.3.md) |
| 1.3.2 | `releases/v1.3.2/`（可回滚） | `dist/workspace-manager-1.3.2.zip`（32,045 B，SHA256 `617D6E36…58B5AC`） | [versions/v1.3.2.md](versions/v1.3.2.md) |
| 1.3.1 | `releases/v1.3.1/`（可回滚） | `dist/workspace-manager-1.3.1.zip`（30,317 B，SHA256 `841EF9E3…2A9E`） | [versions/v1.3.1.md](versions/v1.3.1.md) |
| 1.3.0 | `releases/v1.3.0/`（可回滚） | `dist/workspace-manager-1.3.0.zip`（30,001 B，SHA256 `E78B1A13…A3F3`） | [versions/v1.3.0.md](versions/v1.3.0.md) |
| 1.2.0 | `releases/v1.2.0/`（可回滚） | `dist/workspace-manager-1.2.0.zip`（26,809 B，SHA256 `0E065B9D…DF20C`） | [versions/v1.2.0.md](versions/v1.2.0.md) |
| 1.1.0 | `releases/v1.1.0/`（可回滚） | `dist/workspace-manager-1.1.0.zip`（23,158 B，SHA256 `CAB36C62…6E67`） | [versions/v1.1.0.md](versions/v1.1.0.md) |
| 1.0.0 | **已丢失**（被 1.1.0 覆盖，未及时冻结） | 无 | [versions/v1.0.0.md](versions/v1.0.0.md) |

> 1.0.0 的教训：发版前一定要先冻 `releases/vX.Y.Z/` 再动 dev。从 1.1.0 起按[发版检查清单](../_模板/发版检查清单.md)执行。

## 未发布

_（待填写。新改动先记在这里，发版时归入具体版本号。）_

## 迁移说明

| 存储键 | 引入版本 | 说明 |
|---|---|---|
| `dsh.workspace-manager.v1` | 1.0.0 | 旧键，1.1.0 起只读迁移，不再写入 |
| `dsh.workspace-manager.v2` | 1.1.0 | 现行键；新增文件夹 `color` / `icon` / `pinned` 与视图 `prefs` |

升级到 1.1.0 后首次打开面板会自动把 v1 的文件夹与归类搬到 v2，之后只写 v2。旧键不会被删除，可手动清理。

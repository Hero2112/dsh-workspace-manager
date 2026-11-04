# 安装到另一台电脑

这是一个**纯前端**的 DSH 插件，没有依赖、不需要 `pnpm install`、也不需要构建。

## 目录结构

```
workspace-manager/
├── package.json          插件清单（name: @local/workspace-manager）
├── cordis.patch.yml      插入一行 Loader 配置
├── index.js              Host 半（空实现，只为占位）
├── client.js             全部界面逻辑
├── icon.svg              侧边栏图标
├── locale/zh.json        面板标题与说明（中文）
├── locale/en.json        面板标题与说明（英文）
├── README.md             功能与快捷键说明
└── INSTALL.md            本文件
```

## 三步装好

1. **解压**，把整个 `workspace-manager` 文件夹拷到目标电脑上，建议放：

   ```
   <你的工作区目录>\.dsh-plugins\workspace-manager
   ```

   放别处也能用，只要路径固定、之后别移动。

2. **让 Agent 安装**：在 DeepSeek Harness 里对 Agent 说

   > 安装本地插件包，包目录是 `<上面那个绝对路径>`

   Agent 会调用 `plugin_manager install_bundle`（target = 该目录的绝对路径）。
   成功标志：返回结果里 `application: "applied"`、`warnings: []`。

3. **加载界面**：
   - 先按 `Ctrl + F5` 刷新页面；点左侧面板图标区（「插件」「定时任务」之后）会多一个文件夹图标。
   - 如果左侧没有出现新图标，或点开还是旧样式：**完全退出 DSH 再重新打开**（客户端模块以"代次"缓存，重启才会加载新的一份）。

## 验证是否装好

- 左侧图标：橙色双层文件夹。
- 点开后应看到**双栏**：左边「搜索 / 添加项目 / 收件箱 / 归档区 / 项目列表」，右边是内容区。
- 点开某个对话行：标题是**可点击的链接**（悬停有下划线），行尾只有一个 `⋯`。

## 换电脑后数据是空的（正常）

文件夹结构、归类关系、视图偏好存在**浏览器 localStorage**（键 `dsh.workspace-manager.v2`），不随插件走。

到新电脑上打开时：所有对话都在，但都显示在「未分类」里，需要重新建文件夹归类。工作区本身和对话内容来自工作区目录，不受影响。

想连文件夹结构一起搬：在新电脑的面板里按 F12，把 `localStorage['dsh.workspace-manager.v2']` 的值导出/导入即可（纯 JSON）。

## 兼容性

- 需要 DSH 版本具备 `main` 与 `sidebar.panellist` 两个插槽、以及 `uiWorkspace` 服务。版本太老时插件可能装不上或面板空白 —— 升级 DSH 即可。
- 归档区「恢复」依赖 `uiWorkspace.unarchiveSession`；若某版本没有它，重新打开对话所在工作区时也能在原生归档列表里恢复。

## 卸载

让 Agent 调用 `plugin_manager remove_bundle`（target = `@local/workspace-manager`），然后删掉那个文件夹即可。

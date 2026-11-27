# 安装 Workspace Manager

给第一次装的人看，三步。

## 1. 下载

到 [Releases](https://github.com/Hero2112/dsh-workspace-manager/releases) 下最新那个 `workspace-manager-X.Y.Z.zip`，解压，得到一个 `workspace-manager` 文件夹。

放在一个**以后不会挪动**的固定位置，例如：

```
D:\dsh-plugins\workspace-manager
```

## 2. 让 DSH 装上

在 DeepSeek Harness 里对 Agent 说：

> 安装本地插件包，包目录是 `D:\dsh-plugins\workspace-manager`

装完 **完全退出 DSH 再打开**（不是刷新页面）。

## 3. 用

左侧边栏底部面板图标区，点橙色的文件夹图标（「插件」「定时任务」之后第三个）。

## 升级

下载新版本 zip，解压到 `releases/vX.Y.Z` 这种带版本号的新目录，让 Agent 按新路径重装一次，然后**完全重启** DSH。

> 换安装路径后必须完全重启：客户端模块按代次缓存，只刷新页面会看到图标和面板消失。

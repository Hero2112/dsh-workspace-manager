# 把某个已冻结的版本打成可以发到 npm 的包，并（可选）直接发布。
# 用法：
#   powershell -NoProfile -File tools/publish-npm.ps1 -Version 1.6.3 -PrepareOnly
#   powershell -NoProfile -File tools/publish-npm.ps1 -Version 1.6.3
# 说明：
#   1. 从 releases/vX.Y.Z 复制一份到临时目录，不碰仓库里的文件。
#   2. 改包名（默认 workspace-manager-dsh）、去掉 private、补 license/repository。
#   3. cordis.patch.yml 的模块名和 client.js 的模块 id 一起改成新包名。
#   4. 不加 -PrepareOnly 就执行 npm publish（需要先 npm login 或配好 token）。
param(
  [string]$Version = '',
  [string]$Name = 'workspace-manager-dsh',
  [string]$RepoUrl = 'https://github.com/Hero2112/dsh-workspace-manager',
  [switch]$PrepareOnly
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if ($Version -eq '') {
  $Version = (Get-ChildItem -Path (Join-Path $root 'releases') -Directory |
    Where-Object { $_.Name -match '^v\d+\.\d+\.\d+$' } |
    Sort-Object { [version]($_.Name.TrimStart('v')) } |
    Select-Object -Last 1).Name.TrimStart('v')
}
$releaseDir = Join-Path $root (Join-Path 'releases' "v$Version")
if (-not (Test-Path $releaseDir)) { throw "找不到冻结目录：$releaseDir" }

$stage = Join-Path $env:TEMP "wm-npm-$Version"
if (Test-Path $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null
Copy-Item -Path (Join-Path $releaseDir '*') -Destination $stage -Recurse -Force
Copy-Item -LiteralPath (Join-Path $root 'LICENSE') -Destination (Join-Path $stage 'LICENSE') -Force

# package.json：改名字、去 private、补元数据
$pkgPath = Join-Path $stage 'package.json'
$pkg = Get-Content -LiteralPath $pkgPath -Raw | ConvertFrom-Json
$pkg.name = $Name
$pkg.version = $Version
$pkg | Add-Member -NotePropertyName license -NotePropertyValue 'MIT' -Force
$pkg | Add-Member -NotePropertyName repository -NotePropertyValue @{ type = 'git'; url = "git+$RepoUrl.git" } -Force
$pkg | Add-Member -NotePropertyName homepage -NotePropertyValue $RepoUrl -Force
$pkg | Add-Member -NotePropertyName bugs -NotePropertyValue @{ url = "$RepoUrl/issues" } -Force
$pkg | Add-Member -NotePropertyName keywords -NotePropertyValue @('dsh', 'deepseek-harness', 'plugin', 'workspace', 'conversation') -Force
if ($pkg.PSObject.Properties.Name -contains 'private') { $pkg.PSObject.Properties.Remove('private') }
$pkgJson = $pkg | ConvertTo-Json -Depth 10
[System.IO.File]::WriteAllText($pkgPath, $pkgJson, (New-Object System.Text.UTF8Encoding($false)))

# cordis.patch.yml：模块名换成新包名
$patchPath = Join-Path $stage 'cordis.patch.yml'
$patch = [System.IO.File]::ReadAllText($patchPath)
$patch = $patch.Replace("@local/workspace-manager", $Name)
[System.IO.File]::WriteAllText($patchPath, $patch, (New-Object System.Text.UTF8Encoding($false)))

# client.js：模块 id 一起换
$clientPath = Join-Path $stage 'client.js'
$client = [System.IO.File]::ReadAllText($clientPath)
$client = $client.Replace("id: '@local/workspace-manager'", "id: '$Name'")
if ($client -match '@local/workspace-manager') {
  Write-Warning 'client.js 里还有 @local/workspace-manager，检查一下'
}
[System.IO.File]::WriteAllText($clientPath, $client, (New-Object System.Text.UTF8Encoding($false)))

"暂存目录：$stage"
Get-ChildItem -Path $stage -Recurse -File | ForEach-Object { "  $($_.FullName.Substring($stage.Length + 1))  $($_.Length) B" }
"包名：$Name"
"补丁行：" + (Select-String -Path (Join-Path $stage 'cordis.patch.yml') -Pattern 'name:' | Select-Object -First 1).Line.Trim()
"client id：" + (Select-String -Path $clientPath -Pattern "^\s*id:" | Select-Object -First 1).Line.Trim()

if ($PrepareOnly) {
  '只准备，没有发布。去掉 -PrepareOnly 就会执行 npm publish。'
  return
}

Push-Location $stage
try {
  npm publish --access public
  if ($LASTEXITCODE -ne 0) { throw "npm publish 失败，退出码 $LASTEXITCODE" }
} finally {
  Pop-Location
}
"发布完成：$Name@$Version"

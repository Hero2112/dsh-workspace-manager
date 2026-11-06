# 给某个已冻结的版本补发 GitHub Release（tag + 版本说明 + zip 附件）。
# 用法：powershell -NoProfile -File tools/publish-release.ps1 -Version 1.4.1
# 说明：幂等——release 或附件已存在时会复用/跳过；默认用「最后改动这个 zip 的提交」打 tag。
param(
  [Parameter(Mandatory = $true)][string]$Version,
  [string]$Sha = '',
  [string]$Owner = 'Hero2112',
  [string]$Repo = 'dsh-workspace-manager'
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class CredPublish {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct CREDENTIAL {
    public int Flags; public int Type; public string TargetName; public string Comment;
    public long LastWritten; public int CredentialBlobSize; public IntPtr CredentialBlob;
    public int Persist; public int AttributeCount; public IntPtr Attributes;
    public string TargetAlias; public string UserName;
  }
  [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern bool CredRead(string target, int type, int flags, out IntPtr credential);
  [DllImport("advapi32.dll", SetLastError=true)]
  public static extern void CredFree(IntPtr cred);
}
'@

function Get-GitHubCredential {
  $ptr = [IntPtr]::Zero
  if (-not [CredPublish]::CredRead('git:https://github.com', 1, 0, [ref]$ptr)) {
    throw '系统里没有保存 GitHub 凭据，先手动 git push 一次让凭据落进凭据管理器'
  }
  try {
    $cred = [System.Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type][CredPublish+CREDENTIAL])
    $bytes = New-Object byte[] $cred.CredentialBlobSize
    [System.Runtime.InteropServices.Marshal]::Copy($cred.CredentialBlob, $bytes, 0, $cred.CredentialBlobSize)
    return [System.Text.Encoding]::Unicode.GetString($bytes).TrimEnd([char]0)
  } finally {
    [CredPublish]::CredFree($ptr)
  }
}

$plugin = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$docPath = Join-Path $plugin "versions\v$Version.md"
$zipPath = Join-Path $plugin "dist\workspace-manager-$Version.zip"
if (-not (Test-Path $docPath)) { throw "缺少版本文档 versions\v$Version.md" }
if (-not (Test-Path $zipPath)) { throw "缺少安装包 dist\workspace-manager-$Version.zip" }

if ($Sha -eq '') {
  $Sha = (& git -C $plugin log --format='%H' -1 -- "dist/workspace-manager-$Version.zip").Trim()
  if ($Sha -eq '') { throw "找不到 zip 的提交，手动传 -Sha" }
}

$token = Get-GitHubCredential
$headers = @{
  Authorization = "token $token"
  'User-Agent' = 'dsh-plugin-publisher'
  Accept = 'application/vnd.github+json'
}

$lines = (Get-Content $docPath -Encoding UTF8)
$title = ($lines[0] -replace '^#\s*', '')
$body = (($lines | Select-Object -Skip 1) -join "`n").Trim() + "`n`n---`n`n**安装包**：``workspace-manager-$Version.zip``（见下方 Assets）"

$payload = @{
  tag_name = "v$Version"
  target_commitish = $Sha
  name = $title
  body = $body
  draft = $false
  prerelease = $false
} | ConvertTo-Json -Compress

try {
  $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Owner/$Repo/releases" -Headers $headers -Method Post `
    -Body ([System.Text.Encoding]::UTF8.GetBytes($payload)) -ContentType 'application/json; charset=utf-8'
  Write-Output "已创建 release：$($release.html_url)"
} catch {
  $release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Owner/$Repo/releases/tags/v$Version" -Headers $headers -Method Get
  Write-Output "release 已存在，复用：$($release.html_url)"
}

$existing = @($release.assets | ForEach-Object { $_.name })
if ($existing -contains "workspace-manager-$Version.zip") {
  Write-Output '附件已存在，跳过上传'
} else {
  $zipBytes = [System.IO.File]::ReadAllBytes($zipPath)
  $uploadUrl = "https://uploads.github.com/repos/$Owner/$Repo/releases/$($release.id)/assets?name=workspace-manager-$Version.zip"
  $asset = Invoke-RestMethod -Uri $uploadUrl -Headers $headers -Method Post -Body $zipBytes -ContentType 'application/zip'
  Write-Output ("已上传附件：{0}（{1:N0} 字节）" -f $asset.name, $asset.size)
}

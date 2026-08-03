[CmdletBinding()]
param(
  [string]$OutputFile
)

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$composeFile = Join-Path $repoRoot 'deploy\compose.yaml'
$envFile = Join-Path $repoRoot 'deploy\.env'
$backupRoot = Join-Path $repoRoot 'deploy\backups'

if (-not (Test-Path -LiteralPath $envFile)) {
  throw "找不到 $envFile，请先从 deploy/.env.example 创建本地环境文件。"
}
if ([string]::IsNullOrWhiteSpace($OutputFile)) {
  $OutputFile = Join-Path $backupRoot ("museum-{0}.sql" -f (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss'))
}
$resolvedOutput = [IO.Path]::GetFullPath($OutputFile)
$resolvedBackupRoot = [IO.Path]::GetFullPath($backupRoot)
if (-not $resolvedOutput.StartsWith($resolvedBackupRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw "备份文件必须写入 deploy/backups/，避免误覆盖源码或配置。"
}
New-Item -ItemType Directory -Force -Path $resolvedBackupRoot | Out-Null

docker compose --env-file $envFile -f $composeFile exec -T mysql sh -c 'exec mysqldump --single-transaction --routines --events -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' | Out-File -FilePath $resolvedOutput -Encoding utf8
if ($LASTEXITCODE -ne 0) {
  Remove-Item -LiteralPath $resolvedOutput -Force -ErrorAction SilentlyContinue
  throw "mysqldump 失败。"
}
if ((Get-Item -LiteralPath $resolvedOutput).Length -lt 100) {
  Remove-Item -LiteralPath $resolvedOutput -Force
  throw "备份文件为空或过小，未保留。"
}
Write-Output $resolvedOutput

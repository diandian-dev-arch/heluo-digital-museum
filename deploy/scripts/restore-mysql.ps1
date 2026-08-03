[CmdletBinding(SupportsShouldProcess)]
param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile,
  [string]$TargetDatabase = 'museum_recovery_test'
)

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$composeFile = Join-Path $repoRoot 'deploy\compose.yaml'
$envFile = Join-Path $repoRoot 'deploy\.env'
$resolvedBackup = [IO.Path]::GetFullPath($BackupFile)

if (-not (Test-Path -LiteralPath $envFile)) { throw "找不到 deploy/.env。" }
if (-not (Test-Path -LiteralPath $resolvedBackup)) { throw "找不到备份文件：$resolvedBackup" }
if ($TargetDatabase -notmatch '^[A-Za-z0-9_]+$') { throw 'TargetDatabase 只能包含英文字母、数字和下划线。' }
if ($TargetDatabase -eq 'museum' -and -not $PSCmdlet.ShouldProcess('museum', '覆盖现有数据库')) { return }

$createSql = "CREATE DATABASE IF NOT EXISTS $TargetDatabase CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
$createCommand = 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "' + $createSql + '"'
docker compose --env-file $envFile -f $composeFile exec -T mysql sh -c $createCommand
if ($LASTEXITCODE -ne 0) { throw '创建恢复目标数据库失败。' }

$importCommand = 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" ' + $TargetDatabase
Get-Content -LiteralPath $resolvedBackup -Raw | docker compose --env-file $envFile -f $composeFile exec -T mysql sh -c $importCommand
if ($LASTEXITCODE -ne 0) { throw '导入备份失败。' }
Write-Output "已恢复到数据库：$TargetDatabase"

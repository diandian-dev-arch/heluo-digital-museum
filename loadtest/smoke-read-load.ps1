param(
  [string]$BaseUrl = 'http://localhost:8088',
  [ValidateRange(1, 50)][int]$Concurrency = 10,
  [ValidateRange(1, 500)][int]$RequestsPerWorker = 10
)

$targets = @('/api/v1/artifacts?page=1&size=20', '/api/v1/articles?page=1&size=20', '/api/v1/products?page=1&size=20', '/api/v1/exhibits')
$jobs = 1..$Concurrency | ForEach-Object {
  Start-Job -ArgumentList $BaseUrl, $RequestsPerWorker, $targets -ScriptBlock {
    param($url, $count, $paths)
    $results = foreach ($index in 1..$count) {
      $path = $paths[($index - 1) % $paths.Count]
      $watch = [System.Diagnostics.Stopwatch]::StartNew()
      try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri ($url + $path) -TimeoutSec 15
        [pscustomobject]@{ Ok = ($response.StatusCode -eq 200); DurationMs = $watch.ElapsedMilliseconds; StatusCode = $response.StatusCode }
      } catch {
        [pscustomobject]@{ Ok = $false; DurationMs = $watch.ElapsedMilliseconds; StatusCode = 0 }
      }
    }
    $results
  }
}

$results = $jobs | Wait-Job | Receive-Job
$jobs | Remove-Job
$durations = @($results | ForEach-Object DurationMs | Sort-Object)
$p95Index = [Math]::Min($durations.Count - 1, [Math]::Ceiling($durations.Count * 0.95) - 1)
$success = @($results | Where-Object Ok).Count
[pscustomobject]@{
  Target = $BaseUrl
  TotalRequests = $results.Count
  Concurrency = $Concurrency
  SuccessRequests = $success
  FailureRequests = $results.Count - $success
  SuccessRatePercent = [Math]::Round(100 * $success / $results.Count, 2)
  P50Ms = $durations[[Math]::Floor($durations.Count * 0.5)]
  P95Ms = $durations[$p95Index]
  MaxMs = $durations[-1]
} | Format-List

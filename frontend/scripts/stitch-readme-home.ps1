$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$captureRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../artifacts/readme-live-home'))
$manifest = Get-Content (Join-Path $captureRoot 'capture.json') -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($capture in $manifest.captures) {
    $canvas = [Drawing.Bitmap]::new([int]$capture.width, [int]$capture.height)
    $graphics = [Drawing.Graphics]::FromImage($canvas)
    try {
        for ($i = 0; $i -lt $capture.tiles.Count; $i++) {
            $tile = $capture.tiles[$i]
            $bitmap = [Drawing.Bitmap]::new((Join-Path $captureRoot $tile.file))
            try {
                # Keep the fixed header only once. Overlap supplies all page content beneath it.
                $sourceTop = if ($i -eq 0) { 0 } else { 100 }
                $destinationTop = [int]$tile.y + $sourceTop
                $end = if ($i + 1 -lt $capture.tiles.Count) { [int]$capture.tiles[$i + 1].y + 100 } else { [int]$capture.height }
                $height = $end - $destinationTop
                if ($height -le 0 -or $sourceTop + $height -gt $bitmap.Height) { throw 'Invalid screenshot overlap' }
                $dest = [Drawing.Rectangle]::new(0, $destinationTop, [int]$capture.width, $height)
                $src = [Drawing.Rectangle]::new(0, $sourceTop, [int]$capture.width, $height)
                $graphics.DrawImage($bitmap, $dest, $src, [Drawing.GraphicsUnit]::Pixel)
            } finally { $bitmap.Dispose() }
        }
        $destination = Join-Path $captureRoot $capture.file
        $canvas.Save($destination, [Drawing.Imaging.ImageFormat]::Png)
        Write-Output "$($capture.file): $($capture.width)x$($capture.height) $((Get-FileHash $destination -Algorithm SHA256).Hash)"
    } finally { $graphics.Dispose(); $canvas.Dispose() }
}

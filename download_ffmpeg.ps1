$urls = @(
    "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js",
    "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm",
    "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.worker.js"
)
$outputs = @(
    "public/ffmpeg-core.js",
    "public/ffmpeg-core.wasm",
    "public/ffmpeg-core.worker.js"
)

for ($i = 0; $i -lt $urls.Length; $i++) {
    Write-Host "Downloading $($urls[$i])..."
    Invoke-WebRequest -Uri $urls[$i] -OutFile $outputs[$i]
}

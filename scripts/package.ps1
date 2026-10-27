$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$project = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$packageName = "$($project.name)-$($project.version)"
$distRoot = Join-Path $projectRoot 'dist'
$archivePath = Join-Path $distRoot "$packageName.zip"
if (Test-Path -LiteralPath $archivePath) {
    throw "Archive already exists: $archivePath. Move it aside before creating a new archive."
}

# Explicit allowlist: local data, credentials, screenshots and .git never enter the package.
$entries = @(
    '.gitattributes', '.gitignore', '.dockerignore',
    'package.json', 'README.md', 'LICENSE', 'CHANGELOG.md', 'CONTRIBUTING.md', 'DESIGN.md',
    'Dockerfile', 'server.js', 'armory.js', 'demo.js', 'public', 'test', 'scripts', 'docs'
)
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$files = @()
foreach ($entry in $entries) {
    $source = Join-Path $projectRoot $entry
    if (!(Test-Path -LiteralPath $source)) { throw "Missing source: $entry" }
    if (Test-Path -LiteralPath $source -PathType Container) {
        $files += Get-ChildItem -LiteralPath $source -Recurse -File -Force
    } else {
        $files += Get-Item -LiteralPath $source -Force
    }
}
foreach ($file in $files) {
    if (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
        $file.Name -match '(?i)(^\.env($|\.)|\.(sqlite.*|db|pem|key|log)$)') {
        throw "Excluded file in source directories: $($file.FullName)"
    }
}
New-Item -ItemType Directory -Path $distRoot -Force | Out-Null
$archive = [IO.Compression.ZipFile]::Open($archivePath, [IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($file in ($files | Sort-Object FullName)) {
        $relative = $file.FullName.Substring($projectRoot.Length + 1).Replace('\', '/')
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive, $file.FullName, "$packageName/$relative", [IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
    }
} finally { $archive.Dispose() }
$checksum = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath "$archivePath.sha256" -Value "$checksum  $packageName.zip" -Encoding ascii
Write-Output "Created: $archivePath"
Write-Output "SHA256: $checksum"

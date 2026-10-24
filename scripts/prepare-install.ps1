[CmdletBinding()]
param(
    [ValidateSet('Chrome','Edge')][string]$Browser = 'Chrome',
    [string]$SourceDirectory,
    [string]$InstallDirectory,
    [ValidatePattern('^(latest|v?\d+\.\d+(?:\.\d+){0,2})$')][string]$Version = 'latest',
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$repository = 'zzy2670/Prelude'
$temporary = $null
$sourceKind = if ($SourceDirectory) { 'local-build' } else { 'official-release' }

function Read-PreludeManifest([string]$Directory) {
    $manifestPath = Join-Path $Directory 'manifest.json'
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw 'The source folder must contain manifest.json.' }
    $manifest = [IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json
    if ($manifest.manifest_version -ne 3 -or $manifest.version -notmatch '^\d+\.\d+(?:\.\d+){0,2}$') { throw 'Expected a valid Manifest V3 extension version.' }
    $name = [string]$manifest.name
    if ($name -match '^__MSG_(.+)__$') {
        $messageKey = $Matches[1]
        $locale = [string]$manifest.default_locale
        if ($locale -notmatch '^[a-zA-Z_-]+$') { throw 'Invalid extension locale.' }
        $messagesPath = Join-Path $Directory ("_locales/$locale/messages.json")
        if (-not (Test-Path -LiteralPath $messagesPath -PathType Leaf)) { throw 'The localized extension name is missing.' }
        $messages = [IO.File]::ReadAllText($messagesPath) | ConvertFrom-Json
        $name = [string]$messages.$messageKey.message
    }
    if ($name -notmatch '\u5e8f\u9875|Prelude') { throw 'The selected folder does not identify the Prelude extension.' }
    foreach ($entry in @('index.html',[string]$manifest.background.service_worker)) {
        if (-not $entry -or $entry -match '(^[/\\]|:|(^|[/\\])\.\.([/\\]|$))' -or -not (Test-Path -LiteralPath (Join-Path $Directory $entry) -PathType Leaf)) { throw 'An extension entry point is missing or invalid.' }
    }
    return [pscustomobject]@{ manifest=$manifest; name=$name; version=[string]$manifest.version }
}

function Normalize-Version([string]$Value) {
    $parts = @($Value.TrimStart('v').Split('.'))
    while ($parts.Count -lt 4) { $parts += '0' }
    return ($parts -join '.')
}

function Assert-PlainDirectory([string]$Directory) {
    if (-not (Test-Path -LiteralPath $Directory -PathType Container)) { throw 'The source directory does not exist.' }
    $items = @(Get-Item -LiteralPath $Directory -Force) + @(Get-ChildItem -LiteralPath $Directory -Recurse -Force)
    foreach ($item in $items) {
        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Extension preparation does not follow symbolic links or directory junctions.' }
    }
}

function Expand-CheckedArchive([string]$ArchivePath,[string]$Destination) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($ArchivePath)
    try {
        $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
        $total = [long]0
        $entries = @($archive.Entries)
        if ($entries.Count -gt 2000) { throw 'The archive contains too many files.' }
        $prefix = [IO.Path]::GetFullPath($Destination).TrimEnd('\','/') + [IO.Path]::DirectorySeparatorChar
        foreach ($entry in $entries) {
            $relative = $entry.FullName.Replace('\','/')
            $segments = @($relative.Split('/') | Where-Object { $_ -ne '' })
            if (-not $relative -or $relative.StartsWith('/') -or $relative.Contains(':') -or $segments -contains '..' -or $segments -contains '.') { throw 'The archive contains an unsafe path.' }
            if (-not $seen.Add($relative.TrimEnd('/'))) { throw 'The archive contains duplicate paths.' }
            $unixType = ([long]$entry.ExternalAttributes -shr 16) -band 61440
            if ($unixType -eq 40960) { throw 'Symbolic links are not allowed in the archive.' }
            $total += [long]$entry.Length
            if ($total -gt 67108864) { throw 'The unpacked archive exceeds the extension size limit.' }
            $target = [IO.Path]::GetFullPath((Join-Path $Destination ($relative.Replace('/',[IO.Path]::DirectorySeparatorChar))))
            if (-not $target.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)) { throw 'An archive path escapes its destination.' }
            if ($relative.EndsWith('/')) { New-Item -ItemType Directory -Path $target -Force | Out-Null; continue }
            New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$target,$false)
        }
    } finally { $archive.Dispose() }
}

try {
    if ($env:OS -ne 'Windows_NT') { throw 'This preparation entry targets Windows PowerShell and the Windows browser workflow.' }
    $localData = [Environment]::GetFolderPath('LocalApplicationData')
    if (-not $localData) { throw 'Windows did not provide a local application-data directory.' }
    if (-not $InstallDirectory) { $InstallDirectory = Join-Path $localData ("Prelude/extensions/$Browser") }
    $InstallDirectory = [IO.Path]::GetFullPath($InstallDirectory).TrimEnd('\','/')
    $driveRoot = [IO.Path]::GetPathRoot($InstallDirectory).TrimEnd('\','/')
    $profileRoot = [Environment]::GetFolderPath('UserProfile').TrimEnd('\','/')
    if ($InstallDirectory -eq $driveRoot -or $InstallDirectory -eq $profileRoot -or $InstallDirectory -eq $localData.TrimEnd('\','/')) { throw 'Choose a dedicated permanent extension directory.' }
    $archiveHash = ''
    $downloadUrl = ''
    $releaseTag = ''
    if ($SourceDirectory) {
        $SourceDirectory = (Resolve-Path -LiteralPath $SourceDirectory).Path
        Assert-PlainDirectory $SourceDirectory
    } else {
        $temporary = Join-Path ([IO.Path]::GetTempPath()) ('prelude-prepare-' + [Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $temporary | Out-Null
        $headers = @{ 'User-Agent'='Prelude-Deployment'; 'Accept'='application/vnd.github+json' }
        $endpoint = if ($Version -eq 'latest') { "https://api.github.com/repos/$repository/releases/latest" } else { "https://api.github.com/repos/$repository/releases/tags/v$($Version.TrimStart('v'))" }
        $release = Invoke-RestMethod -Uri $endpoint -Headers $headers -TimeoutSec 30
        if ($release.draft -or $release.prerelease) { throw 'Use a published stable Prelude release.' }
        $releaseTag = [string]$release.tag_name
        $pattern = '^Prelude-(\d+\.\d+(?:\.\d+){0,2})-' + $Browser + '\.zip$'
        $archives = @($release.assets | Where-Object { $_.name -match $pattern })
        $sums = @($release.assets | Where-Object { $_.name -eq 'SHA256SUMS.txt' })
        if ($archives.Count -ne 1 -or $sums.Count -ne 1) { throw 'The release must contain one browser archive and SHA256SUMS.txt.' }
        $archive = $archives[0]
        foreach ($asset in @($archive,$sums[0])) {
            $uri = [Uri]$asset.browser_download_url
            if ($uri.Scheme -ne 'https' -or $uri.Host -ne 'github.com' -or -not $uri.AbsolutePath.StartsWith("/$repository/releases/download/",[StringComparison]::OrdinalIgnoreCase)) { throw 'The release asset URL is not from the official repository.' }
        }
        $archivePath = Join-Path $temporary ([string]$archive.name)
        $sumsPath = Join-Path $temporary 'SHA256SUMS.txt'
        Invoke-WebRequest -UseBasicParsing -Uri $archive.browser_download_url -OutFile $archivePath -TimeoutSec 60
        Invoke-WebRequest -UseBasicParsing -Uri $sums[0].browser_download_url -OutFile $sumsPath -TimeoutSec 30
        if ((Get-Item -LiteralPath $archivePath).Length -ne [long]$archive.size) { throw 'The downloaded archive size does not match the release asset.' }
        $expectedHashes = @()
        foreach ($line in [IO.File]::ReadAllLines($sumsPath)) {
            if ($line -match '^([a-fA-F0-9]{64})\s+\*?(.+)$' -and $Matches[2] -ceq [string]$archive.name) { $expectedHashes += $Matches[1].ToLowerInvariant() }
        }
        if ($expectedHashes.Count -ne 1) { throw 'The archive checksum is missing or duplicated.' }
        $archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($archiveHash -cne $expectedHashes[0]) { throw 'Archive SHA-256 verification failed.' }
        $downloadUrl = [string]$archive.browser_download_url
        $SourceDirectory = Join-Path $temporary 'unpacked'
        New-Item -ItemType Directory -Path $SourceDirectory | Out-Null
        Expand-CheckedArchive $archivePath $SourceDirectory
        Assert-PlainDirectory $SourceDirectory
    }
    $sourceRoot = [IO.Path]::GetFullPath($SourceDirectory).TrimEnd('\','/')
    if ($sourceRoot -ne $InstallDirectory) {
        $separator = [IO.Path]::DirectorySeparatorChar
        if ($InstallDirectory.StartsWith($sourceRoot + $separator,[StringComparison]::OrdinalIgnoreCase) -or $sourceRoot.StartsWith($InstallDirectory + $separator,[StringComparison]::OrdinalIgnoreCase)) { throw 'The source and install directories must not contain one another.' }
    }
    $candidate = Read-PreludeManifest $SourceDirectory
    if ($releaseTag -and (Normalize-Version $releaseTag) -ne (Normalize-Version $candidate.version)) { throw 'The release tag and extension version disagree.' }
    $existingVersion = ''
    if (Test-Path -LiteralPath $InstallDirectory) {
        Assert-PlainDirectory $InstallDirectory
        $recordPath = Join-Path $InstallDirectory '.prelude-deployment.json'
        if (Test-Path -LiteralPath $recordPath -PathType Leaf) {
            $existingRecord = [IO.File]::ReadAllText($recordPath) | ConvertFrom-Json
            if ($existingRecord.product -ne 'Prelude' -or $existingRecord.browser -ne $Browser) { throw 'This preparation directory belongs to another product or browser.' }
        }
        if (@(Get-ChildItem -LiteralPath $InstallDirectory -Force).Count -gt 0) { $existingVersion = (Read-PreludeManifest $InstallDirectory).version }
    }
    $nextAction = if ($existingVersion) { 'reload-existing-extension' } else { 'load-unpacked' }
    $backup = ''
    if (-not $DryRun) {
        if ($existingVersion -and [IO.Path]::GetFullPath($SourceDirectory).TrimEnd('\','/') -ne $InstallDirectory) {
            $backup = $InstallDirectory + '.backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,8)
            New-Item -ItemType Directory -Path $backup | Out-Null
            Get-ChildItem -LiteralPath $InstallDirectory -Force | Copy-Item -Destination $backup -Recurse -Force
        }
        New-Item -ItemType Directory -Path $InstallDirectory -Force | Out-Null
        if ([IO.Path]::GetFullPath($SourceDirectory).TrimEnd('\','/') -ne $InstallDirectory) {
            Get-ChildItem -LiteralPath $SourceDirectory -Force | Where-Object { $_.Name -ne 'manifest.json' } | Copy-Item -Destination $InstallDirectory -Recurse -Force
            Copy-Item -LiteralPath (Join-Path $SourceDirectory 'manifest.json') -Destination (Join-Path $InstallDirectory 'manifest.json') -Force
        }
        $installedFiles = Read-PreludeManifest $InstallDirectory
        if ($installedFiles.version -ne $candidate.version) { throw 'The prepared directory version could not be verified.' }
        $record = [ordered]@{ schemaVersion=1; product='Prelude'; browser=$Browser; version=$candidate.version; installDirectory=$InstallDirectory; sourceKind=$sourceKind; releaseTag=$releaseTag; archiveSha256=$archiveHash; downloadUrl=$downloadUrl; preparedAt=[DateTime]::UtcNow.ToString('o'); installed=$false; status='needs-ui' }
        [IO.File]::WriteAllText((Join-Path $InstallDirectory '.prelude-deployment.json'),($record | ConvertTo-Json -Depth 5),[Text.UTF8Encoding]::new($false))
    }
    [ordered]@{ schemaVersion=1; status=$(if($DryRun){'prepared'}else{'needs-ui'}); prepared=$true; installed=$false; materialized=(-not [bool]$DryRun); dryRun=[bool]$DryRun; browser=$Browser; name=$candidate.name; version=$candidate.version; installDirectory=$InstallDirectory; sourceKind=$sourceKind; releaseTag=$releaseTag; archiveSha256=$archiveHash; downloadUrl=$downloadUrl; previousVersion=$existingVersion; backupDirectory=$backup; nextAction=$(if($DryRun){'run-without-dryrun-before-uia'}else{$nextAction}) } | ConvertTo-Json -Depth 5 -Compress
} catch {
    [ordered]@{ schemaVersion=1; status='failed'; prepared=$false; installed=$false; dryRun=[bool]$DryRun; browser=$Browser; error=$_.Exception.Message } | ConvertTo-Json -Compress
    exit 1
} finally {
    if ($temporary -and (Test-Path -LiteralPath $temporary)) {
        $resolved = (Resolve-Path -LiteralPath $temporary).Path.TrimEnd('\','/')
        $parent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\','/')
        if ([IO.Path]::GetDirectoryName($resolved).TrimEnd('\','/') -eq $parent -and [IO.Path]::GetFileName($resolved) -match '^prelude-prepare-[a-f0-9]{32}$') { Remove-Item -LiteralPath $resolved -Recurse -Force }
    }
}


# PowerShell script to resolve merge conflicts by keeping HEAD version

function Resolve-ConflictKeepOurs {
    param([string]$FilePath)
    
    if (-not (Test-Path $FilePath)) {
        Write-Host "File not found: $FilePath" -ForegroundColor Red
        return $false
    }
    
    try {
        $content = Get-Content -Path $FilePath -Raw -Encoding UTF8
        
        if ($content -notmatch '<<<<<<< HEAD') {
            Write-Host "No conflicts in: $FilePath" -ForegroundColor Gray
            return $true
        }
        
        $lines = $content -split "`n"
        $result = @()
        $inConflict = $false
        $keepLines = @()
        
        for ($i = 0; $i -lt $lines.Count; $i++) {
            $line = $lines[$i]
            
            if ($line -match '^<<<<<<< HEAD') {
                $inConflict = $true
                $keepLines = @()
                continue
            }
            elseif ($line -match '^=======$' -and $inConflict) {
                # Skip until end marker
                $i++
                while ($i -lt $lines.Count -and $lines[$i] -notmatch '^>>>>>>>') {
                    $i++
                }
                # Add kept lines
                $result += $keepLines
                $inConflict = $false
                $keepLines = @()
                continue
            }
            elseif ($line -match '^>>>>>>>' -and $inConflict) {
                $result += $keepLines
                $inConflict = $false
                $keepLines = @()
                continue
            }
            
            if ($inConflict) {
                $keepLines += $line
            }
            else {
                $result += $line
            }
        }
        
        $resolved = $result -join "`n"
        [System.IO.File]::WriteAllText($FilePath, $resolved, [System.Text.UTF8Encoding]::new($false))
        
        Write-Host "✓ Resolved: $FilePath" -ForegroundColor Green
        return $true
    }
    catch {
        Write-Host "Error processing ${FilePath}: $_" -ForegroundColor Red
        return $false
    }
}

# Files to process
$files = @(
    "cordigram-web\app\(auth)\signup\page.tsx",
    "cordigram-backend\package-lock.json",
    "cordigram-backend\src\profiles\profiles.controller.ts",
    "cordigram-web\ui\Sidebar\sidebar.tsx",
    "cordigram-web\ui\Sidebar\sidebar.module.css",
    "cordigram-web\package-lock.json",
    "cordigram-web\app\(main)\page.tsx",
    "cordigram-web\app\(main)\create\page.tsx",
    "cordigram-web\app\(main)\create\create.module.css",
    "cordigram-backend\src\posts\posts.service.ts",
    "cordigram-backend\src\posts\posts.module.ts",
    "cordigram-backend\src\posts\posts.controller.ts",
    "cordigram-backend\src\posts\post.schema.ts",
    "cordigram-backend\package.json"
)

$successCount = 0
$basePath = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "`nResolving merge conflicts (keeping HEAD version)...`n" -ForegroundColor Cyan

foreach ($file in $files) {
    $fullPath = Join-Path $basePath $file
    if (Resolve-ConflictKeepOurs -FilePath $fullPath) {
        $successCount++
    }
}

Write-Host "`n$('='*60)" -ForegroundColor Cyan
Write-Host "Resolved $successCount/$($files.Count) files" -ForegroundColor Cyan
Write-Host "$('='*60)`n" -ForegroundColor Cyan

exit $(if ($successCount -eq $files.Count) { 0 } else { 1 })

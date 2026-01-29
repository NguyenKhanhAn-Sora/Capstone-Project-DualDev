# Simple PowerShell script to resolve merge conflicts keeping HEAD version

function Fix-Conflicts {
    param([string]$FilePath)
    
    $content = Get-Content -Path $FilePath -Raw
    
    # Remove conflicts by keeping HEAD version
    $inConflict = $false
    $keepSection = $true
    $lines = $content -split "`r?`n"
    $result = @()
    
    foreach ($line in $lines) {
        if ($line -match '^<{7} HEAD') {
            $inConflict = $true
            $keepSection = $true
            continue
        }
        elseif ($line -match '^={7}$') {
            $keepSection = $false
            continue
        }
        elseif ($line -match '^>{7}') {
            $inConflict = $false
            $keepSection = $true
            continue
        }
        
        if ($inConflict -and -not $keepSection) {
            continue
        }
        
        $result += $line
    }
    
    $output = $result -join "`n"
    [System.IO.File]::WriteAllText($FilePath, $output)
    Write-Host "Fixed: $FilePath" -ForegroundColor Green
}

$files = @(
    "cordigram-backend\src\posts\posts.service.ts",
    "cordigram-backend\src\profiles\profiles.controller.ts",
    "cordigram-web\app\(auth)\signup\page.tsx",
    "cordigram-web\ui\Sidebar\sidebar.tsx",
    "cordigram-web\ui\Sidebar\sidebar.module.css",
    "cordigram-web\app\(main)\page.tsx",
    "cordigram-web\app\(main)\create\page.tsx",
    "cordigram-web\app\(main)\create\create.module.css"
)

foreach ($file in $files) {
    $fullPath = Join-Path $PSScriptRoot $file
    if (Test-Path $fullPath) {
        Fix-Conflicts -FilePath $fullPath
    }
}

Write-Host "`nDone!" -ForegroundColor Cyan

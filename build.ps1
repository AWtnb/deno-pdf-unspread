$EXENAME = $args[0]
if ($EXENAME.length -lt 1) {
    $EXENAME = (($pwd).Path | Split-Path -Leaf) -replace "^deno-"
}

deno compile --allow-import --allow-read --allow-write --output $EXENAME .\main.ts

if ($LASTEXITCODE -eq 0) {
    if (Test-Path .\.env) {
        $d = (Get-Content .\.env -Raw).Trim()
        $d = [System.Environment]::ExpandEnvironmentVariables($d)
        if (-not (Test-Path $d -PathType Container)) {
            New-Item -Path $d -ItemType Directory
        }
        $n = "{0}.exe" -f $EXENAME
        if (Test-Path $n) {
            Get-Item $n | Copy-Item -Destination $d -Force
            "COPIED {0} to: {1}" -f $n, $d | Write-Host -ForegroundColor Blue
        }
        else {
            "{0} not found!" -f $n | Write-Host -ForegroundColor Magenta
        }
    }
    else {
        ".env not found!" | Write-Host -ForegroundColor Magenta
    }
}
else {
    "Failed to build. Nothing was copied." | Write-Host -ForegroundColor Magenta
}

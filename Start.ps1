$appDirectory = $PSScriptRoot
$packagedPath = Join-Path $appDirectory 'dist\win-unpacked\ESUS IT Offer Generator.exe'
if (Test-Path -LiteralPath $packagedPath) {
    Start-Process -FilePath $packagedPath -WorkingDirectory (Split-Path $packagedPath) -WindowStyle Hidden
    exit 0
}
$electronPath = Join-Path $appDirectory 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path -LiteralPath $electronPath)) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show('Electron fehlt. Bitte zuerst die Projektabhaengigkeiten installieren.','ESUS App') | Out-Null
    exit 1
}
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $appDirectory 'scripts/prepare-invoice.ps1')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Start-Process -FilePath $electronPath -ArgumentList ('"' + $appDirectory + '"') -WorkingDirectory $appDirectory -WindowStyle Hidden

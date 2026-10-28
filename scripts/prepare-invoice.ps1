# Private Windows x64 resources; no system Python/Java installation required.
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not [Environment]::Is64BitOperatingSystem) { throw 'Windows x64 is required.' }
$setupRoot = Join-Path $projectRoot 'runtime/setup'
$downloads = Join-Path $setupRoot 'downloads'
$stage = Join-Path $setupRoot 'stage'
$pythonTarget = Join-Path $projectRoot 'runtime/python'
$vendorTarget = Join-Path $projectRoot 'invoice/vendor'
$toolsTarget = Join-Path $projectRoot 'invoice/tools'
$stamp = Join-Path $projectRoot 'runtime/invoice-ready.sha256'
$requirements = Join-Path $projectRoot 'invoice/requirements.txt'

function Get-Sha256([string]$path) {
    $stream = [IO.File]::OpenRead($path)
    try {
        $sha = [Security.Cryptography.SHA256]::Create()
        try {
            return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
        } finally {
            $sha.Dispose()
        }
    } finally {
        $stream.Dispose()
    }
}

$fingerprint = (Get-Sha256 $PSCommandPath) + (Get-Sha256 $requirements)

function Remove-ManagedDirectory([string]$directory) {
    $absolute = [IO.Path]::GetFullPath($directory)
    if (-not $absolute.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove a directory outside the project: $absolute"
    }
    if (Test-Path -LiteralPath $absolute) { Remove-Item -LiteralPath $absolute -Recurse -Force }
}
function Download-Verified([string]$name, [string]$url, [string]$sha256) {
    $destination = Join-Path $downloads $name
    if (-not (Test-Path -LiteralPath $destination) -or (Get-Sha256 $destination) -ne $sha256.ToLowerInvariant()) {
        Write-Host "Downloading $name"
        Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $destination
    }
    if ((Get-Sha256 $destination) -ne $sha256.ToLowerInvariant()) { throw "SHA256 mismatch: $name" }
    return $destination
}
function Run-Checked([string]$executable, [string[]]$arguments) {
    & $executable @arguments
    if ($LASTEXITCODE -ne 0) { throw "Command failed ($LASTEXITCODE): $executable" }
}
if ((Test-Path -LiteralPath $stamp) -and (Get-Content $stamp -Raw).Trim() -eq $fingerprint -and
    (Test-Path "$pythonTarget/python.exe") -and (Test-Path "$vendorTarget/facturx/__init__.py") -and
    (Test-Path "$toolsTarget/java/bin/java.exe") -and (Test-Path "$toolsTarget/verapdf/bin/cli-1.30.3.jar")) {
    Write-Host 'Invoice resources are already prepared.'
    exit 0
}
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
New-Item -ItemType Directory -Force $downloads | Out-Null
Remove-ManagedDirectory $stage
New-Item -ItemType Directory -Force $stage | Out-Null
$pythonZip = Download-Verified 'python-3.12.10.zip' 'https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip' '4acbed6dd1c744b0376e3b1cf57ce906f9dc9e95e68824584c8099a63025a3c3'
$javaZip = Download-Verified 'java-17.0.20.1.zip' 'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.20.1%2B1/OpenJDK17U-jre_x64_windows_hotspot_17.0.20.1_1.zip' 'bc21a93923103cdaac93ee337b0ae4365e739fde36df823dd456bc67c8a9d352'
$veraZip = Download-Verified 'verapdf-1.30.3.zip' 'https://software.verapdf.org/rel/1.30/verapdf-greenfield-1.30.3-installer.zip' 'b512bf24945503a33fc10738ecffc1f2dccaaf8593a448e94ee9ac86a9559a59'
$pipWheel = Download-Verified 'pip-25.3.whl' 'https://files.pythonhosted.org/packages/44/3c/d717024885424591d5376220b5e836c2d5293ce2011523c9de23ff7bf068/pip-25.3-py3-none-any.whl' '9655943313a94722b7774661c21049070f6bbb0a1516bf02f7c8d5d9201514cd'
$pythonStage = Join-Path $stage 'python'
$vendorStage = Join-Path $stage 'vendor'
$toolsStage = Join-Path $stage 'tools'
Expand-Archive -LiteralPath $pythonZip -DestinationPath $pythonStage
$python = Join-Path $pythonStage 'python.exe'
# Bootstrap pip only for the builder, without putting it in the shipped runtime.
$pipCode = "import runpy,sys; sys.path.insert(0,sys.argv.pop(1)); runpy.run_module('pip',run_name='__main__')"
Run-Checked $python @('-I', '-c', $pipCode, $pipWheel, '--isolated', 'install', '--disable-pip-version-check', '--no-compile', '--only-binary=:all:', '--require-hashes', '--target', $vendorStage, '-r', $requirements)
Expand-Archive -LiteralPath $javaZip -DestinationPath (Join-Path $stage 'java-archive')
New-Item -ItemType Directory -Force $toolsStage | Out-Null
$javaDirectory = @(Get-ChildItem (Join-Path $stage 'java-archive') -Directory)
if ($javaDirectory.Count -ne 1) { throw 'Unexpected Java archive layout.' }
Move-Item -LiteralPath $javaDirectory[0].FullName -Destination (Join-Path $toolsStage 'java')
Expand-Archive -LiteralPath $veraZip -DestinationPath (Join-Path $stage 'vera-archive')
$installer = @(Get-ChildItem (Join-Path $stage 'vera-archive') -Filter 'verapdf-izpack-installer-1.30.3.jar' -Recurse)
if ($installer.Count -ne 1) { throw 'Unexpected veraPDF archive layout.' }
$veraTarget = Join-Path $toolsStage 'verapdf'
$escapedTarget = [Security.SecurityElement]::Escape($veraTarget)
$autoInstall = Join-Path $stage 'verapdf-install.xml'
@"
<AutomatedInstallation langpack="eng">
  <com.izforge.izpack.panels.htmlhello.HTMLHelloPanel id="welcome"/>
  <com.izforge.izpack.panels.target.TargetPanel id="install_dir"><installpath>$escapedTarget</installpath></com.izforge.izpack.panels.target.TargetPanel>
  <com.izforge.izpack.panels.packs.PacksPanel id="sdk_pack_select">
    <pack index="0" name="veraPDF GUI" selected="true"/>
    <pack index="1" name="veraPDF Mac and *nix Scripts" selected="true"/>
    <pack index="2" name="veraPDF Validation model" selected="false"/>
    <pack index="3" name="veraPDF Documentation" selected="false"/>
    <pack index="4" name="veraPDF Sample Plugins" selected="false"/>
  </com.izforge.izpack.panels.packs.PacksPanel>
  <com.izforge.izpack.panels.install.InstallPanel id="install"/>
  <com.izforge.izpack.panels.finish.FinishPanel id="finish"/>
</AutomatedInstallation>
"@ | Set-Content -LiteralPath $autoInstall -Encoding UTF8
Run-Checked (Join-Path $toolsStage 'java/bin/java.exe') @('-jar', $installer[0].FullName, $autoInstall)
if (-not (Test-Path "$veraTarget/bin/cli-1.30.3.jar")) { throw 'veraPDF CLI was not installed.' }
# Isolated Python searches only its standard library and our private dependencies.
"python312.zip`n.`n../../invoice/vendor`n../invoice/vendor`n" | Set-Content (Join-Path $pythonStage 'python312._pth') -Encoding ASCII
foreach ($pair in @(@($vendorStage, $vendorTarget), @($toolsStage, $toolsTarget), @($pythonStage, $pythonTarget))) {
    Remove-ManagedDirectory $pair[1]
    Move-Item -LiteralPath $pair[0] -Destination $pair[1]
}
Run-Checked (Join-Path $pythonTarget 'python.exe') @('-I', '-c', "import pdfplumber, PIL, lxml, saxonche, facturx, reportlab; print('Invoice Python dependencies verified.')")
$fingerprint | Set-Content -LiteralPath $stamp -Encoding ASCII
Remove-ManagedDirectory $stage
Write-Host 'Invoice resources prepared. Python and Java will be bundled by electron-builder.'

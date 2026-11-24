param(
    [int]$Port = 8090,
    [switch]$Background
)
$ErrorActionPreference = 'Stop'
$server = Join-Path $PSScriptRoot 'preview.mjs'
if ($Background) {
    $nodeExe = (Get-Command node -ErrorAction Stop).Source
    $process = Start-Process -FilePath $nodeExe -ArgumentList @(
        ('"' + $server + '"'), '--port', $Port
    ) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
    Write-Output "Harbor View: http://127.0.0.1:$Port (PID $($process.Id))"
} else {
    & node $server --port $Port
    exit $LASTEXITCODE
}

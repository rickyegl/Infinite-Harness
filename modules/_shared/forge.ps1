param(
    [Parameter(Mandatory)][string]$Action,   # up | restart | keepalive | tunnel | stop | cleanup
    [Parameter(Mandatory)][string]$Forge,    # paths.forge (Windows path)
    [Parameter(Mandatory)][string]$Log,      # where the launcher's output goes (outside the repo)
    [int]$LocalPort = 8765,
    [string]$Distro = 'Ubuntu'
)
# Runs one action of the forge's own launcher (launcher/colab-launcher.sh) in WSL, detached, with its output
# appended to $Log. The model-download token comes from the launcher's DPAPI file and is passed to WSL only through
# the environment, only for `up` and `restart`. Nothing here prints a token. `restart` uploads the code again and
# restarts the server on the running runtime, so forge code changes take effect (queued jobs re-queue).
$ErrorActionPreference = 'Stop'
$wsl = '/mnt/' + $Forge.Substring(0, 1).ToLower() + ($Forge.Substring(2) -replace '\\', '/')
$sh = "$wsl/launcher/colab-launcher.sh"
$state = Split-Path $Log
New-Item -ItemType Directory -Force $state | Out-Null
$flag = Join-Path $state 'drive.flag'
Set-Content -Encoding ASCII $flag 'skip'          # no Drive mount: the forge keeps its data on the VM
$env:FORGE_LOG = $Log
$env:CL_FLAG = $flag
$env:FORGE_RIG = '1'                              # install the rigger too, for characters
$env:FORGE_RESTART = if ($Action -eq 'restart') { '1' } else { '0' }
$env:FORGE_HF_TOKEN = ''
if ($Action -in 'up', 'restart') {
    $hf = Join-Path $env:LOCALAPPDATA 'ColabLauncher\hf_token.dat'
    if (Test-Path $hf) {
        $sec = Get-Content $hf | ConvertTo-SecureString
        $env:FORGE_HF_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
    }
}
$env:WSLENV = 'FORGE_LOG/p:FORGE_HF_TOKEN:CL_FLAG/p:FORGE_RIG:FORGE_RESTART'
$launcherArgs = switch ($Action) {
    'up' { "forge up `"$wsl`"" }
    'restart' { "forge up `"$wsl`"" }
    'keepalive' { "forge keepalive `"$wsl`"" }
    'tunnel' { "forge tunnel $LocalPort 8000" }
    'stop' { 'forge stop' }
    'cleanup' { 'forge cleanup' }
    default { throw "unknown action $Action" }
}
$p = Start-Process wsl.exe "-d $Distro -- bash `"$sh`" $launcherArgs" -WindowStyle Hidden -PassThru
$env:FORGE_HF_TOKEN = $null
"$($p.Id)"

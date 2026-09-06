# Single health check for confessn.com. Intended to be run every 10 minutes via Scheduled Task.

param(
    [string]$Url = "https://confessn.com",
    [string]$LogPath = "$PSScriptRoot\site-monitor.log",
    [string]$StatePath = "$PSScriptRoot\site-monitor-state.txt"
)

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $LogPath -Value "[$timestamp] $Message"
}

$previousStatus = if (Test-Path $StatePath) { Get-Content $StatePath -Raw } else { "" }
$previousStatus = $previousStatus.Trim()

try {
    $response = Invoke-WebRequest -Uri $Url -Method Head -TimeoutSec 15 -UseBasicParsing
    $statusCode = $response.StatusCode
    $isUp = $statusCode -ge 200 -and $statusCode -lt 400
    $currentStatus = if ($isUp) { "UP" } else { "WARN" }

    if ($currentStatus -ne $previousStatus) {
        Write-Log "$currentStatus - Site responded with status $statusCode"
    }
} catch {
    $currentStatus = "DOWN"
    if ($currentStatus -ne $previousStatus) {
        Write-Log "DOWN - Request failed: $($_.Exception.Message)"
    }
}

Set-Content -Path $StatePath -Value $currentStatus

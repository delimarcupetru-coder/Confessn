# Pings confessn.com every 10 minutes and logs outages/status changes.
# Run manually with: powershell -ExecutionPolicy Bypass -File scripts\monitor-site.ps1

param(
    [string]$Url = "https://confessn.com",
    [int]$IntervalMinutes = 10,
    [string]$LogPath = "$PSScriptRoot\site-monitor.log"
)

function Write-Log {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$timestamp] $Message"
    Write-Host $line
    Add-Content -Path $LogPath -Value $line
}

$lastStatus = $null

Write-Log "Starting monitor for $Url (checking every $IntervalMinutes minutes)"

while ($true) {
    try {
        $response = Invoke-WebRequest -Uri $Url -Method Head -TimeoutSec 15 -UseBasicParsing
        $statusCode = $response.StatusCode
        $isUp = $statusCode -ge 200 -and $statusCode -lt 400

        if ($isUp) {
            if ($lastStatus -ne "UP") {
                Write-Log "UP - Site responded with status $statusCode"
            }
            $lastStatus = "UP"
        } else {
            Write-Log "WARNING - Unexpected status code $statusCode"
            $lastStatus = "WARN"
        }
    } catch {
        Write-Log "DOWN - Request failed: $($_.Exception.Message)"
        $lastStatus = "DOWN"
    }

    Start-Sleep -Seconds ($IntervalMinutes * 60)
}

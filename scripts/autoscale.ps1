
# ============================================================
# Orbital - Resource-Aware PM2 Autoscaler
# Platform: Windows PowerShell 7+

# Scales a PM2 cluster between 1 and 5 workers.
# Uses CPU hysteresis, RAM protection, cooldowns,
# PM2 state verification and gradual scaling.
# ============================================================

# ---------------- CONFIGURATION ----------------

$AppName = "orbital-api"

$MinWorkers = 1
$MaxWorkers = 5

$IntervalSeconds = 10

# Normal CPU scaling
$ScaleUpCpu = 72
$ScaleDownCpu = 35

$ScaleUpChecks = 3
$ScaleDownChecks = 8

# Emergency CPU scaling
$EmergencyCpu = 85
$EmergencyChecks = 2

# Memory protection
$MaxMemoryPercent = 90
$CriticalMemoryPercent = 95

# Cooldowns
$ScaleUpCooldownSeconds = 60
$ScaleDownCooldownSeconds = 120

# Verify PM2 after scaling
$ScaleVerificationTimeoutSeconds = 45

# ---------------- STATE ----------------

$HighCpuCount = 0
$LowCpuCount = 0
$EmergencyCpuCount = 0

$LastScaleTime = [DateTime]::MinValue
$ScalingInProgress = $false

# ---------------- LOGGING ----------------

function Write-Log {
    param(
        [string]$Message,
        [string]$Level = "INFO"
    )

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

    Write-Host "[$timestamp][$Level] $Message"
}

# ---------------- CPU AND RAM ----------------

function Get-HostMetrics {

    # Sample CPU for two seconds to reduce noisy readings.
    $counter = Get-Counter `
        -Counter '\Processor(_Total)\% Processor Time' `
        -SampleInterval 1 `
        -MaxSamples 2 `
        -ErrorAction Stop

    $cpuSample = $counter |
        Select-Object -Last 1

    $cpu = [double]$cpuSample.CounterSamples[0].CookedValue

    # Host-wide physical memory usage.
    $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop

    $totalMemory = [double]$os.TotalVisibleMemorySize
    $freeMemory = [double]$os.FreePhysicalMemory

    if ($totalMemory -le 0) {
        throw "Unable to read physical memory information"
    }

    $memory = (1 - ($freeMemory / $totalMemory)) * 100

    return [PSCustomObject]@{
        CPU = [math]::Round($cpu, 1)
        Memory = [math]::Round($memory, 1)
    }
}

# ---------------- PM2 PROCESS INFORMATION ----------------

function Get-WorkerInfo {

    $json = & pm2 jlist 2>&1 | Out-String

    if ($LASTEXITCODE -ne 0) {
        throw "Unable to retrieve PM2 process list: $json"
    }

    try {
        $processes = ConvertFrom-Json `
            -InputObject $json `
            -AsHashtable `
            -ErrorAction Stop
    }
    catch {
        throw "Invalid PM2 JSON response"
    }

    $appProcesses = @(
        $processes | Where-Object {
            $_["name"] -ceq $AppName
        }
    )

    $workers = @(
        $appProcesses | Where-Object {
            $_["pm2_env"]["status"] -ceq "online"
        }
    )

    $clusterWorkers = @(
        $workers | Where-Object {
            $_["pm2_env"]["exec_mode"] -eq "cluster_mode"
        }
    )

    return [PSCustomObject]@{
        Total = $appProcesses.Count
        Online = $workers.Count
        Cluster = $clusterWorkers.Count
    }
}

# ---------------- SCALING ----------------

function Set-WorkerCount {
    param(
        [int]$Target
    )

    if ($ScalingInProgress) {
        Write-Log "Another scaling operation is active" "WARN"
        return $false
    }

    if ($Target -lt $MinWorkers -or $Target -gt $MaxWorkers) {
        Write-Log "Rejected invalid target: $Target" "ERROR"
        return $false
    }

    $script:ScalingInProgress = $true

    try {

        Write-Log "Scaling $AppName to $Target workers" "SCALE"

        & pm2 scale $AppName $Target

        if ($LASTEXITCODE -ne 0) {
            Write-Log "PM2 scale command failed" "ERROR"
            return $false
        }

        # Wait until PM2 reports the requested number online.
        $deadline = (Get-Date).AddSeconds(
            $ScaleVerificationTimeoutSeconds
        )

        while ((Get-Date) -lt $deadline) {

            Start-Sleep -Seconds 2

            $info = Get-WorkerInfo

            if ($info.Online -eq $Target) {

                Write-Log "Scaling successful: $Target online workers" "SUCCESS"

                $script:LastScaleTime = Get-Date

                return $true
            }
        }

        Write-Log (
            "Scaling verification timed out. Target={0}, Online={1}" `
            -f $Target, $info.Online
        ) "ERROR"

        return $false
    }
    finally {
        $script:ScalingInProgress = $false
    }
}

# ---------------- STARTUP ----------------

Write-Host ""
Write-Host "=========================================="
Write-Host "       Orbital PM2 AUTOSCALER"
Write-Host "=========================================="
Write-Host "Application       : $AppName"
Write-Host "Worker range      : $MinWorkers - $MaxWorkers"
Write-Host "Sampling interval : $IntervalSeconds seconds"
Write-Host "Scale-up CPU      : $ScaleUpCpu%"
Write-Host "Emergency CPU     : $EmergencyCpu%"
Write-Host "Scale-down CPU    : $ScaleDownCpu%"
Write-Host "RAM guard         : $MaxMemoryPercent%"
Write-Host "=========================================="
Write-Host ""

if (-not (Get-Command pm2 -ErrorAction SilentlyContinue)) {
    throw "PM2 command not found in PATH"
}

$initialInfo = Get-WorkerInfo

if ($initialInfo.Online -lt $MinWorkers) {
    throw "No online workers found for $AppName"
}

if ($initialInfo.Cluster -ne $initialInfo.Online) {
    throw "All online workers must run in PM2 cluster mode"
}

if ($initialInfo.Online -gt $MaxWorkers) {
    throw "Current worker count exceeds configured maximum"
}

Write-Log "Autoscaler started with $($initialInfo.Online) workers"

# ---------------- MAIN LOOP ----------------

while ($true) {

    try {

        $metrics = Get-HostMetrics
        $workerInfo = Get-WorkerInfo

        $cpu = $metrics.CPU
        $memory = $metrics.Memory
        $workers = $workerInfo.Online

        if ($workers -lt $MinWorkers -or $workers -gt $MaxWorkers) {
            Write-Log "Unexpected worker count: $workers" "ERROR"
            Start-Sleep -Seconds $IntervalSeconds
            continue
        }

        $elapsed = ((Get-Date) - $LastScaleTime).TotalSeconds

        $scaleUpCooldownComplete = (
            $elapsed -ge $ScaleUpCooldownSeconds
        )

        $scaleDownCooldownComplete = (
            $elapsed -ge $ScaleDownCooldownSeconds
        )

        Write-Host (
            "[METRICS] CPU: {0}% | RAM: {1}% | Workers: {2}" `
            -f $cpu, $memory, $workers
        )

        # ---------------- CPU PRESSURE ----------------

        if ($cpu -ge $EmergencyCpu) {

            $EmergencyCpuCount++
            $HighCpuCount++
            $LowCpuCount = 0

        }
        elseif ($cpu -ge $ScaleUpCpu) {

            $HighCpuCount++
            $EmergencyCpuCount = 0
            $LowCpuCount = 0

        }
        elseif ($cpu -le $ScaleDownCpu) {

            $LowCpuCount++
            $HighCpuCount = 0
            $EmergencyCpuCount = 0

        }
        else {

            $HighCpuCount = 0
            $LowCpuCount = 0
            $EmergencyCpuCount = 0

        }

        # ---------------- MEMORY GUARDS ----------------

        if ($memory -ge $CriticalMemoryPercent) {

            Write-Log (
                "Critical RAM pressure: {0}%. Scale-up disabled." `
                -f $memory
            ) "CRITICAL"

        }
        elseif ($memory -ge $MaxMemoryPercent) {

            Write-Log (
                "RAM guard active: {0}%. Scale-up disabled." `
                -f $memory
            ) "WARN"

        }

        # ---------------- SCALE UP ----------------

        $emergencyTriggered = (
            $EmergencyCpuCount -ge $EmergencyChecks
        )

        $normalScaleTriggered = (
            $HighCpuCount -ge $ScaleUpChecks
        )

        if (
            ($emergencyTriggered -or $normalScaleTriggered) -and
            $workers -lt $MaxWorkers -and
            $memory -lt $MaxMemoryPercent -and
            $scaleUpCooldownComplete
        ) {

            $target = [math]::Min(
                $workers + 1,
                $MaxWorkers
            )

            $reason = if ($emergencyTriggered) {
                "Emergency CPU pressure"
            }
            else {
                "Sustained CPU pressure"
            }

            Write-Log "$reason. Adding one worker." "SCALE"

            if (Set-WorkerCount -Target $target) {
                $HighCpuCount = 0
                $EmergencyCpuCount = 0
                $LowCpuCount = 0
            }

        }
        elseif (
            ($emergencyTriggered -or $normalScaleTriggered) -and
            $memory -ge $MaxMemoryPercent
        ) {

            Write-Log "Scale-up blocked by RAM protection" "GUARD"

        }
        elseif (
            $workers -ge $MaxWorkers -and
            ($emergencyTriggered -or $normalScaleTriggered)
        ) {

            Write-Log "Maximum worker count reached" "WARN"

        }

        # ---------------- SCALE DOWN ----------------

        elseif (
            $LowCpuCount -ge $ScaleDownChecks -and
            $workers -gt $MinWorkers -and
            $scaleDownCooldownComplete -and
            $memory -lt $CriticalMemoryPercent
        ) {

            $target = [math]::Max(
                $workers - 1,
                $MinWorkers
            )

            Write-Log "Sustained low CPU. Removing one worker." "SCALE"

            if (Set-WorkerCount -Target $target) {
                $LowCpuCount = 0
                $HighCpuCount = 0
                $EmergencyCpuCount = 0
            }

        }

        # ---------------- STATUS ----------------

        if ($workers -eq $MaxWorkers) {
            Write-Log "At maximum capacity. Monitor latency and resource pressure." "INFO"
        }

    }
    catch {

        Write-Log $_.Exception.Message "ERROR"

    }

    Start-Sleep -Seconds $IntervalSeconds
}

$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot '../scripts/publish_demo.ps1'
$global:demoCalls = @()
$global:demoCase = ''
$global:demoListCount = 0

function global:gh {
    $command = $args -join ' '
    $global:demoCalls += $command
    $global:LASTEXITCODE = 0
    if ($command -like 'auth status*') {
        if ($global:demoCase -eq 'auth-failure') { $global:LASTEXITCODE = 1 }
        return
    }
    if ($command -like '*git/ref/heads/main*') { return ('1' * 40) }
    if ($command -like 'api --include*') {
        if ($global:demoCase -eq 'forbidden') {
            $global:LASTEXITCODE = 1
            return "HTTP/2.0 403 Forbidden`n`n{}"
        }
        if ($global:demoCase -eq 'new-site') {
            $global:LASTEXITCODE = 1
            return "HTTP/2.0 404 Not Found`n`n{}"
        }
        if ($global:demoCase -eq 'legacy-site') {
            return "HTTP/2.0 200 OK`n`n{`"build_type`":`"legacy`"}"
        }
        return "HTTP/2.0 200 OK`n`n{`"build_type`":`"workflow`"}"
    }
    if ($command -like 'run list*') {
        $global:demoListCount++
        if ($global:demoListCount -eq 1) { return '[]' }
        return ('[{"databaseId":12,"headSha":"' + ('1' * 40) + '"}]')
    }
    if ($command -like 'workflow run*' -and $global:demoCase -eq 'dispatch-failure') {
        $global:LASTEXITCODE = 1
    }
    if ($command -like 'run watch*' -and $global:demoCase -eq 'run-failure') {
        $global:LASTEXITCODE = 1
    }
    if ($command -like 'api *--jq .html_url') {
        return 'https://yurimakes.github.io/family-trip-planner/'
    }
}

function global:Invoke-WebRequest {
    if ($global:demoCase -eq 'live-failure') { throw 'page unavailable' }
    return [pscustomobject]@{ StatusCode = 200; Content = '<meta name="family-trip-mode" content="static">' }
}

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw $Message }
}

try {
    foreach ($case in @('new-site', 'existing-site', 'legacy-site', 'auth-failure', 'forbidden',
                       'dispatch-failure', 'run-failure', 'live-failure')) {
        $global:demoCase = $case
        $global:demoCalls = @()
        $global:demoListCount = 0
        $caught = $null
        try { & $scriptPath -Wait } catch { $caught = $_ }
        $shouldFail = $case -in @('auth-failure', 'forbidden', 'dispatch-failure', 'run-failure', 'live-failure')
        Assert-True (($null -ne $caught) -eq $shouldFail) "Unexpected outcome: $case / $caught"
        $calls = $global:demoCalls -join "`n"
        Assert-True (($calls -match 'api --method POST') -eq ($case -eq 'new-site')) "Unexpected Pages creation: $case"
        Assert-True (($calls -match 'api --method PUT') -eq ($case -eq 'legacy-site')) "Unexpected Pages update: $case"
        if ($case -in @('auth-failure', 'forbidden')) {
            Assert-True ($calls -notmatch 'workflow run') "Deployment must stop on access failure: $case"
        }
        if ($case -eq 'dispatch-failure') {
            Assert-True ($calls -notmatch 'run watch') 'A failed dispatch must not be watched as successful.'
        }
        Write-Host "PASS: $case"
    }
} finally {
    Remove-Item function:\gh -ErrorAction SilentlyContinue
    Remove-Item function:\Invoke-WebRequest -ErrorAction SilentlyContinue
    Remove-Variable demoCalls, demoCase, demoListCount -Scope Global -ErrorAction SilentlyContinue
}

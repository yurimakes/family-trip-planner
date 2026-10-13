param([switch]$Wait)

$ErrorActionPreference = 'Stop'
$repo = 'yurimakes/family-trip-planner'
$workflow = 'public-demo.yml'

function Invoke-GhCommand {
    param([string[]]$GhArguments)
    $savedPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = & gh @GhArguments 2>&1
        $commandExit = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $savedPreference
    }
    return [pscustomobject]@{ ExitCode = $commandExit; Text = ($output | Out-String).Trim() }
}

function Require-Gh {
    param([string[]]$GhArguments, [string]$Failure)
    $result = Invoke-GhCommand -GhArguments $GhArguments
    if ($result.ExitCode -ne 0) { throw $Failure }
    return $result
}

function Get-DispatchRuns {
    $result = Require-Gh -GhArguments @('run', 'list', '--repo', $repo, '--workflow', $workflow,
        '--branch', 'main', '--event', 'workflow_dispatch', '--limit', '20',
        '--json', 'databaseId,headSha') -Failure 'Could not read deployment runs.'
    return @($result.Text | ConvertFrom-Json)
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw 'GitHub CLI is required. Install gh, then run gh auth login.'
}
$auth = Invoke-GhCommand -GhArguments @('auth', 'status', '--hostname', 'github.com')
if ($auth.ExitCode -ne 0) { throw 'GitHub login is required. Run gh auth login first.' }

$head = Require-Gh -GhArguments @('api', "repos/$repo/git/ref/heads/main", '--jq', '.object.sha') `
    -Failure 'Could not read remote main. Check authentication and network access.'
$mainSha = $head.Text.Trim()
if ($mainSha -notmatch '^[a-f0-9]{40}$') { throw 'Remote main returned an invalid commit ID.' }

$pages = Invoke-GhCommand -GhArguments @('api', '--include', "repos/$repo/pages")
$statusMatch = [regex]::Match($pages.Text, '(?m)^HTTP/\S+\s+(\d{3})')
if (-not $statusMatch.Success) { throw 'Could not read Pages settings. No deployment requested.' }
$httpStatus = [int]$statusMatch.Groups[1].Value
if ($httpStatus -eq 404) {
    $null = Require-Gh -GhArguments @('api', '--method', 'POST', "repos/$repo/pages",
        '-f', 'build_type=workflow', '--silent') -Failure 'Could not enable Pages. Repository administrator access is required.'
} elseif ($httpStatus -eq 200 -and $pages.ExitCode -eq 0) {
    $bodyMatch = [regex]::Match($pages.Text, '(?s)\r?\n\r?\n(.*)$')
    if (-not $bodyMatch.Success) { throw 'Pages settings returned no JSON body.' }
    $settings = $bodyMatch.Groups[1].Value | ConvertFrom-Json
    if ($settings.build_type -ne 'workflow') {
        $null = Require-Gh -GhArguments @('api', '--method', 'PUT', "repos/$repo/pages",
            '-f', 'build_type=workflow', '--silent') -Failure 'Could not set Pages to GitHub Actions.'
    }
} else {
    throw "Pages settings could not be read (HTTP $httpStatus). No deployment requested."
}

$before = @(Get-DispatchRuns)
$previousIds = @($before | ForEach-Object { $_.databaseId })
$null = Require-Gh -GhArguments @('workflow', 'run', $workflow, '--repo', $repo, '--ref', 'main') `
    -Failure 'Could not start the deployment workflow. No successful deployment is claimed.'
Write-Host "Deployment requested for $repo at $mainSha."

if (-not $Wait) {
    Write-Host 'Publication and URL access are not verified yet. Check the Actions workflow result.'
    return
}

$deploymentRun = $null
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    $runs = @(Get-DispatchRuns)
    $deploymentRun = $runs | Where-Object {
        $_.headSha -eq $mainSha -and $_.databaseId -notin $previousIds
    } | Sort-Object databaseId -Descending | Select-Object -First 1
    if ($deploymentRun) { break }
    Start-Sleep -Seconds 2
}
if (-not $deploymentRun) { throw 'Deployment was requested, but its run ID was not found. Check Actions before retrying.' }
Write-Host "Waiting for validation and deployment run $($deploymentRun.databaseId)..."
$null = Require-Gh -GhArguments @('run', 'watch', [string]$deploymentRun.databaseId, '--repo', $repo, '--exit-status') `
    -Failure "Validation or deployment failed. Inspect Actions run $($deploymentRun.databaseId)."
$site = Require-Gh -GhArguments @('api', "repos/$repo/pages", '--jq', '.html_url') `
    -Failure 'Deployment succeeded, but the published URL could not be read.'
$url = $site.Text.Trim()
if ($url -ne 'https://yurimakes.github.io/family-trip-planner/') {
    throw 'Deployment succeeded, but the URL differs from the expected project address. Check Pages settings.'
}
try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30
    if ($response.StatusCode -ne 200 -or $response.Content -notmatch 'name="family-trip-mode" content="static"') {
        throw 'The public demo marker is missing.'
    }
} catch {
    throw 'Deployment succeeded, but live page access is not verified. Check the Pages URL after propagation.'
}
Write-Host "Verified web demo: $url"

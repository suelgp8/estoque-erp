param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("feat", "fix", "docs", "chore", "refactor", "test", "build", "ci", "perf", "style", "revert")]
  [string]$Type,

  [string]$Scope,

  [Parameter(Mandatory = $true)]
  [string]$Message,

  [switch]$Push
)

$candidates = @(
  "git",
  "$env:ProgramFiles\Git\cmd\git.exe",
  "$env:ProgramFiles\Git\bin\git.exe",
  "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe"
)

$resolved = $null

foreach ($candidate in $candidates) {
  $command = Get-Command $candidate -ErrorAction SilentlyContinue

  if ($command) {
    $resolved = $command.Source
    break
  }

  if (Test-Path $candidate) {
    $resolved = $candidate
    break
  }
}

if (-not $resolved) {
  Write-Error "Nao foi possivel localizar o git. Reabra o terminal ou reinstale o Git."
  exit 1
}

$branch = (& $resolved rev-parse --abbrev-ref HEAD).Trim()

if ($branch -eq "main") {
  Write-Error "Evite commit direto na main. Crie uma branch feature/, fix/, chore/ ou hotfix/."
  exit 1
}

$status = & $resolved status --porcelain

if (-not $status) {
  Write-Output "Nao ha alteracoes para commit."
  exit 0
}

$summary = $Message.Trim()
$scopeText = if ($null -ne $Scope) { $Scope.Trim() } else { "" }

if (-not $summary) {
  Write-Error "A mensagem do commit nao pode ficar vazia."
  exit 1
}

if ($scopeText) {
  $commitMessage = "{0}({1}): {2}" -f $Type, $scopeText, $summary
} else {
  $commitMessage = "{0}: {1}" -f $Type, $summary
}

& $resolved add -A

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

& $resolved commit -m $commitMessage

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

if ($Push) {
  & $resolved push -u origin $branch
  exit $LASTEXITCODE
}

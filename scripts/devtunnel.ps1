param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Args
)

$candidates = @(
  "devtunnel",
  "$env:LOCALAPPDATA\Microsoft\WinGet\Links\devtunnel.exe",
  "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Microsoft.devtunnel_Microsoft.Winget.Source_8wekyb3d8bbwe\devtunnel.exe"
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
  Write-Error "Nao foi possivel localizar o devtunnel.exe. Reabra o terminal ou reinstale o Microsoft.devtunnel."
  exit 1
}

& $resolved @Args
exit $LASTEXITCODE

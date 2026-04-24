# Abre a loja em produção em janela privada (sem cache / localStorage antigo do localhost).
# Uso: clique duas vezes em open-vercel-anonimo.bat ou: powershell -File scripts/open-vercel-anonimo.ps1

$u = 'https://app-pedidos-loja-cliente.vercel.app/'

$edge = @(
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

$chrome = "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe"

if ($edge) {
  Start-Process $edge -ArgumentList '-inprivate', $u
  Write-Host 'Abrindo no Edge (InPrivate)...'
} elseif (Test-Path $chrome) {
  Start-Process $chrome -ArgumentList '--incognito', $u
  Write-Host 'Abrindo no Chrome (anônima)...'
} else {
  Start-Process $u
  Write-Host 'Abrindo no navegador padrão (se ainda ver catálogo velho, instale Edge ou Chrome).'
}

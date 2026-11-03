<#
  توقف سرویس «دستیار هوشمند کمیته امداد» (پورت 8094)
  مصرف:  powershell -ExecutionPolicy Bypass -File deploy\stop-server.ps1
#>
param([int]$Port = 8094)

$pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
if ($pm2) {
  pm2 stop emdad-chat 2>$null | Out-Null
  pm2 delete emdad-chat 2>$null | Out-Null
}

try {
  $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
  foreach ($c in $conns) {
    Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
    Write-Host ("[OK] فرایند " + $c.OwningProcess + " روی پورت " + $Port + " متوقف شد.") -ForegroundColor Green
  }
} catch {
  Write-Host "فرایندی روی پورت $Port در حال اجرا نبود." -ForegroundColor Yellow
}

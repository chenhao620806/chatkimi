[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$body = '{"model":"Pro/moonshotai/Kimi-K2.6","messages":[{"role":"user","content":"hi"}],"stream":false}'
$r = Invoke-WebRequest -Uri 'https://api.siliconflow.cn/v1/chat/completions' -Method POST -Body $body -ContentType 'application/json' -Headers @{'Authorization'='Bearer sk-ervkdtntadcqdsmyrnelrcuwmxcsdixdhxbxjvxksanmpsrv'} -TimeoutSec 30
Write-Host "Status:" $r.StatusCode
$len = [Math]::Min(800, $r.Content.Length)
Write-Host "Content:" $r.Content.Substring(0, $len)
# create_repo.ps1
$repoName = Read-Host "Р’РІРµРґРёС‚Рµ РёРјСЏ СЂРµРїРѕР·РёС‚РѕСЂРёСЏ"
$isPrivate = Read-Host "РЎРґРµР»Р°С‚СЊ РїСЂРёРІР°С‚РЅС‹Рј? (y/N)"

$visibility = "public"
if ($isPrivate -eq "y") { $visibility = "private" }

git init
git add .
git commit -m "Initial commit"

$result = gh repo create $repoName --$visibility --source=. --remote=origin --push 2>&1

if ($LASTEXITCODE -eq 0) {
    $username = gh api user -q .login
    Write-Host "Р“РѕС‚РѕРІРѕ! Р РµРїРѕР·РёС‚РѕСЂРёР№: https://github.com/$username/$repoName" -ForegroundColor Green
} else {
    Write-Host "РћС€РёР±РєР°: $result" -ForegroundColor Red
}

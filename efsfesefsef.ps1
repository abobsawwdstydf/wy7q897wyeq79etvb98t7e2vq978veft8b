@'
# create_repo.ps1
$repoName = Read-Host "Введите имя репозитория"
$isPrivate = Read-Host "Сделать приватным? (y/N)"

$visibility = "public"
if ($isPrivate -eq "y") { $visibility = "private" }

git init
git add .
git commit -m "Initial commit"

$result = gh repo create $repoName --$visibility --source=. --remote=origin --push 2>&1

if ($LASTEXITCODE -eq 0) {
    $username = gh api user -q .login
    Write-Host "Готово! Репозиторий: https://github.com/$username/$repoName" -ForegroundColor Green
} else {
    Write-Host "Ошибка: $result" -ForegroundColor Red
}
'@ | Out-File -FilePath "correct_repo.ps1" -Encoding UTF8
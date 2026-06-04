# create_repo.ps1
$repoName = Read-Host "Введите имя репозитория"
$isPrivate = Read-Host "Сделать приватным? (y/N)"

$visibility = "public"
if ($isPrivate -eq "y") { $visibility = "private" }

# Инициализация git
git init
git add .
git commit -m "Initial commit"

# Создание репозитория и пуш
gh repo create $repoName --$visibility --source=. --remote=origin --push

Write-Host "Готово! Репозиторий: https://github.com/(gh api user -q .login)/$repoName" -ForegroundColor Green
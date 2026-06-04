# Скрипт для создания репозитория на GitHub из текущей папки (Windows)

# Цвета для вывода
$Green = "Green"
$Red = "Red"
$Yellow = "Yellow"

# Функции вывода
function Write-Info {
    Write-Host "[INFO] $args" -ForegroundColor $Green
}

function Write-Error {
    Write-Host "[ERROR] $args" -ForegroundColor $Red
}

function Write-Warning {
    Write-Host "[WARNING] $args" -ForegroundColor $Yellow
}

# Проверка наличия gh
$ghPath = (Get-Command gh -ErrorAction SilentlyContinue)
if (-not $ghPath) {
    Write-Error "GitHub CLI (gh) не установлен!"
    Write-Host "Скачайте с: https://cli.github.com/" -ForegroundColor Cyan
    Write-Host "Или установите через winget: winget install --id GitHub.cli" -ForegroundColor Cyan
    exit 1
}

# Проверка авторизации
$authStatus = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Вы не авторизованы в GitHub CLI"
    Write-Host "Запустите: gh auth login" -ForegroundColor Cyan
    exit 1
}

# Запрос имени репозитория
$repoName = Read-Host "Введите имя репозитория"
if ([string]::IsNullOrWhiteSpace($repoName)) {
    Write-Error "Имя репозитория не может быть пустым"
    exit 1
}

# Запрос описания
$repoDesc = Read-Host "Введите описание (опционально)"
$isPrivate = Read-Host "Сделать репозиторий приватным? (y/N)"

$visibility = "public"
if ($isPrivate -eq "y" -or $isPrivate -eq "Y") {
    $visibility = "private"
}

Write-Info "Создание репозитория $repoName ($visibility)..."

# Инициализация git если нужно
if (-not (Test-Path ".git")) {
    Write-Info "Инициализация git репозитория..."
    git init
}

# Добавление файлов
Write-Info "Добавление файлов..."
git add .

# Создание коммита
$hasCommits = git log -1 2>$null
if (-not $hasCommits) {
    Write-Info "Создание коммита..."
    git commit -m "Initial commit"
}

# Создание репозитория на GitHub и пуш
if ([string]::IsNullOrWhiteSpace($repoDesc)) {
    gh repo create $repoName --$visibility --source=. --remote=origin --push
} else {
    gh repo create $repoName --$visibility --description "$repoDesc" --source=. --remote=origin --push
}

if ($LASTEXITCODE -eq 0) {
    $username = gh api user -q .login
    Write-Info "Успешно! Репозиторий: https://github.com/$username/$repoName"
} else {
    Write-Error "Ошибка при создании репозитория"
    exit 1
}
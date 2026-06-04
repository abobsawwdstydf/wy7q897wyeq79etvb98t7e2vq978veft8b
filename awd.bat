@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ========================================
echo   Создание репозитория на GitHub
echo ========================================
echo.

:: Проверка наличия gh
where gh >nul 2>nul
if %errorlevel% neq 0 (
    echo [ОШИБКА] GitHub CLI (gh) не установлен!
    echo Скачайте с: https://cli.github.com/
    pause
    exit /b 1
)

:: Проверка авторизации
gh auth status >nul 2>nul
if %errorlevel% neq 0 (
    echo [ОШИБКА] Вы не авторизованы в GitHub CLI
    echo Запустите: gh auth login
    pause
    exit /b 1
)

:: Ввод имени репозитория
set /p REPO_NAME="Введите имя репозитория: "
if "!REPO_NAME!"=="" (
    echo [ОШИБКА] Имя не может быть пустым
    pause
    exit /b 1
)

:: Ввод описания
set /p REPO_DESC="Введите описание (опционально): "

:: Приватный или публичный
set /p IS_PRIVATE="Сделать репозиторий приватным? (y/N): "
if /i "!IS_PRIVATE!"=="y" (
    set VISIBILITY=private
) else (
    set VISIBILITY=public
)

echo.
echo [INFO] Создание репозитория !REPO_NAME! (!VISIBILITY!)...

:: Инициализация git если нужно
if not exist ".git" (
    echo [INFO] Инициализация git репозитория...
    git init
)

:: Добавление файлов
echo [INFO] Добавление файлов...
git add .

:: Создание коммита
git rev-parse HEAD >nul 2>nul
if %errorlevel% neq 0 (
    echo [INFO] Создание коммита...
    git commit -m "Initial commit"
)

:: Создание репозитория и пуш
if "!REPO_DESC!"=="" (
    gh repo create !REPO_NAME! --!VISIBILITY! --source=. --remote=origin --push
) else (
    gh repo create !REPO_NAME! --!VISIBILITY! --description "!REPO_DESC!" --source=. --remote=origin --push
)

if %errorlevel% equ 0 (
    echo.
    echo [УСПЕХ] Репозиторий создан и код загружен!
    for /f "tokens=*" %%i in ('gh api user -q .login') do set USERNAME=%%i
    echo Ссылка: https://github.com/!USERNAME!/!REPO_NAME!
) else (
    echo [ОШИБКА] Не удалось создать репозиторий
)

echo.
pause
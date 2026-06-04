# repo.ps1
$repoName = Read-Host "Enter repository name"
$isPrivate = Read-Host "Private? (y/N)"

$visibility = "public"
if ($isPrivate -eq "y") { $visibility = "private" }

git init
git add .
git commit -m "Initial commit"

gh repo create $repoName --$visibility --source=. --remote=origin --push

Write-Host "Done!" -ForegroundColor Green

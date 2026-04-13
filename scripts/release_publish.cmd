@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0\.."

set "BUMP_LABEL="
set "NPM_BUMP="

if /I "%~1"=="app" (
  set "BUMP_LABEL=app"
  set "NPM_BUMP=major"
) else if /I "%~1"=="major" (
  set "BUMP_LABEL=major"
  set "NPM_BUMP=minor"
) else if /I "%~1"=="minor" (
  set "BUMP_LABEL=minor"
  set "NPM_BUMP=patch"
)

if not defined NPM_BUMP (
  echo.
  echo Wybierz rodzaj podbicia wersji:
  echo   [A] app   - X.0.0
  echo   [M] major - 0.X.0
  echo   [N] minor - 0.0.X
  choice /C AMN /M "Twoj wybor"

  if errorlevel 3 (
    set "BUMP_LABEL=minor"
    set "NPM_BUMP=patch"
  ) else if errorlevel 2 (
    set "BUMP_LABEL=major"
    set "NPM_BUMP=minor"
  ) else (
    set "BUMP_LABEL=app"
    set "NPM_BUMP=major"
  )
)

for /f %%I in ('git branch --show-current') do set "CURRENT_BRANCH=%%I"
if not defined CURRENT_BRANCH (
  echo [ERROR] Nie udalo sie ustalic aktualnej galezi git.
  exit /b 1
)

set "GIT_STATUS="
for /f "delims=" %%I in ('git status --porcelain') do (
  set "GIT_STATUS=dirty"
  goto :git_dirty_found
)
:git_dirty_found
if defined GIT_STATUS (
  echo [ERROR] Repo zawiera niezacommitowane zmiany. Najpierw uporzadkuj working tree.
  exit /b 1
)

for /f %%I in ('node -p "require('./package.json').version"') do set "OLD_VERSION=%%I"
if not defined OLD_VERSION (
  echo [ERROR] Nie udalo sie odczytac obecnej wersji z package.json.
  exit /b 1
)

echo.
echo Aktualna wersja: %OLD_VERSION%
echo Wybrany bump: %BUMP_LABEL%
echo.

call npm version %NPM_BUMP% --no-git-tag-version
if errorlevel 1 (
  echo [ERROR] Nie udalo sie podbic wersji przez npm version.
  exit /b 1
)

for /f %%I in ('node -p "require('./package.json').version"') do set "NEW_VERSION=%%I"
if not defined NEW_VERSION (
  echo [ERROR] Nie udalo sie odczytac nowej wersji z package.json.
  exit /b 1
)

echo Nowa wersja: %NEW_VERSION%

git add package.json package-lock.json
if errorlevel 1 (
  echo [ERROR] Nie udalo sie dodac plikow wersji do commita.
  exit /b 1
)

git commit -m "release: bump version to v%NEW_VERSION%"
if errorlevel 1 (
  echo [ERROR] Commit nie powiodl sie.
  exit /b 1
)

git push origin "%CURRENT_BRANCH%"
if errorlevel 1 (
  echo [ERROR] Push na GitHub nie powiodl sie.
  exit /b 1
)

if not defined GH_TOKEN (
  echo.
  set /p GH_TOKEN=Podaj GH_TOKEN do publikacji: 
)

if not defined GH_TOKEN (
  echo [ERROR] GH_TOKEN jest wymagany do publikacji.
  exit /b 1
)

echo.
echo Publikacja release v%NEW_VERSION%...
call npx electron-builder --win --publish always
if errorlevel 1 (
  echo [ERROR] electron-builder zakonczyl sie bledem.
  exit /b 1
)

echo.
echo Gotowe. Wersja v%NEW_VERSION% zostala wypchnieta i opublikowana.
exit /b 0

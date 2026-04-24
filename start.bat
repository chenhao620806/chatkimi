@echo off
setlocal EnabledDelayedExpansion

echo === Checking Port 3000 ===
netstat -ano | findstr ":3000" >nul 2>&1
if %errorlevel% equ 0 (
    echo [WARNING] Port 3000 may be in use
) else (
    echo [OK] Port 3000 is free
)

echo.
echo === Starting Dev Server ===
cd /d "%~dp0"
start http://localhost:3000
call npm run dev
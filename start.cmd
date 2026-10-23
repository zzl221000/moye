@echo off
setlocal
cd /d "%~dp0"
start "" cmd /c "timeout /t 1 >nul & start http://127.0.0.1:8777"
node serve.mjs

@echo off
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0open-vercel-anonimo.ps1"
timeout /t 3 >nul

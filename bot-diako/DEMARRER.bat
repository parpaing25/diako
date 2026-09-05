@echo off
REM Lance le bot de collecte Diako et ouvre l'interface web.
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"
echo.
echo   Bot de collecte Diako
echo   ---------------------
echo   L'interface s'ouvre dans le navigateur. Laissez cette fenetre ouverte.
echo   Ctrl+C pour arreter.
echo.
python demarrer.py %*
pause

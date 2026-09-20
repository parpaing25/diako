@echo off
rem Montre ce que Facebook a VRAIMENT en file sur la page Di'ako, jour par jour.
rem Lecture seule : ce lanceur ne publie rien et ne modifie rien.
cd /d "C:\Users\ANDRIANIRINA\Desktop\Diako"
set PYTHONIOENCODING=utf-8
python marketing\atelier\etat_file.py --ecrire
echo.
echo Le tableau est aussi enregistre dans marketing\atelier\ETAT-FILE.md
pause

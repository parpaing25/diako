@echo off
rem Programme la derniere publication Di'ako de la serie 2 (19/10 12:00, d-recit) :
rem a lancer a partir du DIMANCHE 20/09 vers 14 h (Facebook refuse au-dela de ~28,9 jours).
rem Sans risque : le script relit la file de Facebook (pas de doublon), et un refus ne cree rien.
rem La serie 1 (18 h) est complete depuis le 19/09 au soir : ce lanceur ne touche que sortie2.
cd /d "C:\Users\ANDRIANIRINA\Desktop\Diako"
set PYTHONIOENCODING=utf-8
python marketing\atelier\programmer.py --sortie sortie2 --fenetre-jours 28.95
echo.
echo --- Ce que Facebook a en file ---
python marketing\atelier\programmer.py --sortie sortie2 --controler
pause

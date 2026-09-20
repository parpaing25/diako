@echo off
rem Navigateur de publication Di'ako : compte Onjaniaina Andrianirina, profil dedie, port 9224.
rem Se connecter UNE fois a Facebook dans cette fenetre ; la session reste dans le profil.
start "" chrome.exe --remote-debugging-port=9224 --user-data-dir="C:\Users\ANDRIANIRINA\.diako-profil-onja" --no-first-run --no-default-browser-check --window-size=1360,960 "https://business.facebook.com/latest/home?asset_id=108742855158464"

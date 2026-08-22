# Enregistre une tache Windows qui demarre le bot a l'ouverture de session.
#
# Les collectes de 11 h et 18 h sont pilotees PAR LE BOT lui-meme : elles
# n'ont lieu que s'il tourne. Cette tache garantit qu'il tourne.
#
#   Installer  : powershell -ExecutionPolicy Bypass -File outils\installer-tache-planifiee.ps1
#   Desinstaller : Unregister-ScheduledTask -TaskName "Bot de collecte Diako" -Confirm:$false

$ErrorActionPreference = "Stop"
$racine = Split-Path -Parent $PSScriptRoot
$lanceur = Join-Path $racine "DEMARRER.bat"

if (-not (Test-Path $lanceur)) { throw "Introuvable : $lanceur" }

# -sans-navigateur : sinon un onglet s'ouvre a CHAQUE ouverture de session.
# Le bot tourne quand meme, et http://127.0.0.1:8757 reste joignable.
$action    = New-ScheduledTaskAction -Execute $lanceur -Argument "--sans-navigateur" `
                -WorkingDirectory $racine
$demarrage = New-ScheduledTaskTrigger -AtLogOn
# Les reglages par defaut arretent une tache au bout de 3 jours et la coupent
# sur batterie : ni l'un ni l'autre ne convient a un bot qui doit rester la.
$options   = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries `
                -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) `
                -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5)

Register-ScheduledTask -TaskName "Bot de collecte Diako" -Action $action `
    -Trigger $demarrage -Settings $options -Description `
    "Demarre le bot de collecte Diako (collectes 11h et 18h)." -Force | Out-Null

Write-Host "Tache enregistree. Le bot demarrera a chaque ouverture de session."
Write-Host "Pour le lancer maintenant : Start-ScheduledTask -TaskName 'Bot de collecte Diako'"
Write-Host "Interface : http://127.0.0.1:8757"

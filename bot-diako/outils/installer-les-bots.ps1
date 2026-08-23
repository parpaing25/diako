#Requires -Version 5.1
<#
    INSTALLE LES TROIS BOTS COMME SERVICES DE FAIT.

    Une tache par bot, qui appelle le GARDIEN a l'ouverture de session PUIS
    toutes les dix minutes :
      · si le bot repond, la tache ne fait rien et sort ;
      · s'il est tombe, elle le relance.

    ROUGE — POURQUOI PAS SIMPLEMENT « AU DEMARRAGE DE SESSION ». C'est ce qui
    etait en place, et ca n'a pas suffi le 23/08/2026 : les trois bots sont
    morts en cours de journee, tues par le manque de memoire, alors que la
    session restait ouverte. Une tache qui ne se declenche qu'a l'ouverture de
    session ne repasse jamais. Il faut une REPETITION.

    ATTENTION — ON PASSE PAR `schtasks`, PAS PAR `Register-ScheduledTask`. Le
    cmdlet PowerShell rend « Acces refuse » depuis un processus non eleve ou
    restreint, alors que l'outil natif enregistre la meme tache sans broncher.
    Mesure sur cette machine le 23/08/2026 : le cmdlet echoue sur les trois
    bots, `schtasks` reussit.

    ATTENTION — CES TACHES TOURNENT SOUS VOTRE SESSION, et c'est necessaire :
    les bots ont besoin du profil Chromium (session Facebook), des dossiers du
    Bureau et du reseau de l'utilisateur. Une tache SYSTEM ne verrait rien de
    tout ca.

    Installer   : powershell -ExecutionPolicy Bypass -File outils\installer-les-bots.ps1
    Desinstaller: powershell -ExecutionPolicy Bypass -File outils\installer-les-bots.ps1 -Retirer
#>
param([switch] $Retirer)

$gardien = Join-Path $PSScriptRoot "gardien.ps1"
if (-not (Test-Path $gardien)) { throw "Introuvable : $gardien" }

$bureau = [Environment]::GetFolderPath("Desktop")

# ATTENTION — NOUVEAUX NOMS DE TACHES, ET C'EST VOULU. Les anciennes taches
# (« Bot annonces Fonenako », « Bot de collecte Diako ») lancaient DEMARRER.bat,
# qui se termine par `pause` : chaque mort du bot laissait un cmd.exe et un
# conhost.exe orphelins. Il y en avait dix le 23/08, pour 728 Mo de memoire
# virtuelle. Le gardien lance python directement.
$bots = @(
    @{ Nom = "Fonenako"; Port = 8756
       Dossier = Join-Path $bureau "Fonenako preprod\29031\Fonenako FinAL GITHUB\bot-annonces"
       Tache = "Gardien bot Fonenako"; Ancienne = "Bot annonces Fonenako"; Cle = "fonenako" },
    @{ Nom = "Diako"; Port = 8757
       Dossier = Join-Path $bureau "Diako\bot-diako"
       Tache = "Gardien bot Diako"; Ancienne = "Bot de collecte Diako"; Cle = "diako" },
    @{ Nom = "AKORA"; Port = 8758
       Dossier = Join-Path $bureau "AKORA\akora\bot-fournisseurs"
       Tache = "Gardien bot AKORA"; Ancienne = "Bot fournisseurs AKORA"; Cle = "akora" }
)

if ($Retirer) {
    foreach ($b in $bots) {
        & schtasks.exe /Delete /TN $b.Tache /F 2>&1 | Out-Null
        Write-Host ("retiree : {0}" -f $b.Tache)
    }
    return
}

$installes = 0
foreach ($b in $bots) {
    if (-not (Test-Path (Join-Path $b.Dossier "demarrer.py"))) {
        Write-Host ("IGNORE {0} : {1} n'existe pas." -f $b.Nom, $b.Dossier) -ForegroundColor Yellow
        continue
    }

    # L'ancienne tache faisait double emploi. On la desactive si on en a le
    # droit ; sinon tant pis : elle relancerait un bot deja debout, et le
    # gardien verrait simplement son port repondre.
    & schtasks.exe /Change /TN $b.Ancienne /DISABLE 2>&1 | Out-Null

    # ATTENTION — 261 CARACTERES MAXIMUM POUR /TR. Passer le chemin du bot en
    # argument faisait deborder la limite a cause de « Fonenako preprod\29031\
    # Fonenako FinAL GITHUB ». Le gardien prend donc un simple mot-cle.
    $commande = '"powershell -NoP -W Hidden -Ep Bypass -File \"' + $gardien +
                '\" -Bot ' + $b.Cle + '"'

    # /SC MINUTE /MO 10 : toutes les dix minutes tant que la session est ouverte.
    #   ATTENTION : /RI n'est PAS accepte avec /SC ONLOGON sur cette version de
    #   Windows — c'est pour ca qu'on planifie a la minute plutot qu'a
    #   l'ouverture de session. La tache reprend d'elle-meme apres une
    #   reconnexion, et le premier passage a lieu dans les dix minutes.
    $sortie = & cmd.exe /c "schtasks /Create /TN `"$($b.Tache)`" /TR $commande /SC MINUTE /MO 10 /F 2>&1"
    if ($LASTEXITCODE -eq 0) {
        Write-Host ("installe : {0}  ->  port {1}" -f $b.Tache, $b.Port) -ForegroundColor Green
        & schtasks.exe /Run /TN $b.Tache 2>&1 | Out-Null
        $installes++
    } else {
        Write-Host ("ECHEC {0} : {1}" -f $b.Tache, ($sortie -join " ")) -ForegroundColor Red
    }
}

Write-Host ""
Write-Host ("{0} bot(s) sous surveillance. Adresses :" -f $installes)
Write-Host "   Fonenako : http://127.0.0.1:8756"
Write-Host "   Diako    : http://127.0.0.1:8757"
Write-Host "   AKORA    : http://127.0.0.1:8758"
Write-Host ""
Write-Host "Le gardien note ses relances dans <dossier du bot>\data\gardien.log."
Write-Host "Verifier : schtasks /Query /TN `"Gardien bot Diako`""

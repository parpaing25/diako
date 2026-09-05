#Requires -Version 5.1
<#
    GARDIEN — remet un bot debout quand il est tombe.

    Lance par le Planificateur de taches toutes les dix minutes. Si le bot
    repond, il ne fait rien et sort. Sinon il le relance, sans fenetre.

    ROUGE — POURQUOI CE FICHIER EXISTE. Le 23/08/2026, les trois bots se sont
    eteints ensemble. Ce n'etait pas une panne logicielle : la machine n'avait
    plus que 1,15 Go de memoire VIRTUELLE libre sur 29,3, et Windows tue les
    processus dans cet etat. Une tache « au demarrage de session » ne rattrape
    pas ca : la session, elle, ne s'est jamais fermee. Il faut quelqu'un qui
    repasse regulierement.

    ATTENTION — ON TESTE LE PORT, PAS LE PROCESSUS. Un python vivant mais bloque
    laisse quand meme son port ferme quand uvicorn est mort ; et surtout, la
    ligne de commande de tous les bots est identique (« python demarrer.py »),
    donc chercher le processus reviendrait a confondre les trois. Le port, lui,
    designe un bot et un seul.

    ATTENTION — ON N'APPELLE PAS DEMARRER.bat. Le .bat se termine par `pause` :
    lance par le planificateur, il laisse un cmd.exe et un conhost.exe orphelins
    a CHAQUE mort du bot. Il y en avait dix le 23/08. On lance python
    directement ; le .bat reste pour le double-clic.

    Usage :
      powershell -ExecutionPolicy Bypass -File gardien.ps1 -Dossier "C:\...\bot-diako" -Port 8757 -Nom "Diako"
#>
#
# ATTENTION — LE BOT SE DESIGNE PAR UN MOT, PAS PAR SON CHEMIN. `schtasks`
# refuse une commande de plus de 261 caracteres, et le chemin de Fonenako
# (« Fonenako preprod\29031\Fonenako FinAL GITHUB\bot-annonces ») la faisait
# deborder a lui seul. La table des trois bots vit donc ici.
param(
    [ValidateSet("fonenako", "diako", "akora", "page")]
    [string] $Bot,
    [string] $Dossier,
    [int]    $Port,
    [string] $Nom = "bot"
)

$ErrorActionPreference = "Stop"

if ($Bot) {
    $bureau = [Environment]::GetFolderPath("Desktop")
    $table = @{
        fonenako = @{ Nom = "Fonenako"; Port = 8756
                      Dossier = Join-Path $bureau "Fonenako preprod\29031\Fonenako FinAL GITHUB\bot-annonces" }
        diako    = @{ Nom = "Diako";    Port = 8757
                      Dossier = Join-Path $bureau "Diako\bot-diako" }
        akora    = @{ Nom = "AKORA";    Port = 8758
                      Dossier = Join-Path $bureau "AKORA\akora\bot-fournisseurs" }
        # Ajoute le 23/08/2026 : le bot de la PAGE Facebook Fonenako (8759)
        # etait le seul des quatre sans gardien — il serait reste mort apres
        # la prochaine saturation memoire, comme les trois autres le 23/08.
        page     = @{ Nom = "Page Fonenako"; Port = 8759
                      Dossier = Join-Path $bureau "Fonenako preprod\29031\Fonenako FinAL GITHUB\bot-page" }
    }
    $choisi = $table[$Bot]
    $Dossier = $choisi.Dossier
    $Port = $choisi.Port
    $Nom = $choisi.Nom
}

if (-not $Dossier -or -not $Port) { throw "Indiquez -Bot, ou -Dossier et -Port." }

function Ecrire-Journal([string] $message) {
    $ligne = "{0}  [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Nom, $message
    $dossierJournal = Join-Path $Dossier "data"
    if (-not (Test-Path $dossierJournal)) {
        New-Item -ItemType Directory -Path $dossierJournal -Force | Out-Null
    }
    $fichier = Join-Path $dossierJournal "gardien.log"
    Add-Content -Path $fichier -Value $ligne -Encoding utf8
    # Le journal ne doit pas grossir indefiniment : on garde 500 lignes.
    $contenu = Get-Content $fichier -ErrorAction SilentlyContinue
    if ($contenu.Count -gt 500) {
        Set-Content -Path $fichier -Value ($contenu | Select-Object -Last 400) -Encoding utf8
    }
}

function Port-Repond([int] $p) {
    # TcpClient et non Invoke-WebRequest : sous pression memoire, la seconde
    # n'arrive meme plus a charger ses assemblys — c'est exactement la situation
    # dans laquelle ce script doit fonctionner.
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $essai = $client.BeginConnect("127.0.0.1", $p, $null, $null)
        if (-not $essai.AsyncWaitHandle.WaitOne(2000, $false)) { return $false }
        $client.EndConnect($essai)
        return $true
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

if (-not (Test-Path (Join-Path $Dossier "demarrer.py"))) {
    Ecrire-Journal "ABANDON : demarrer.py introuvable dans $Dossier"
    exit 1
}

if (Port-Repond $Port) { exit 0 }   # tout va bien, rien a dire

# Le bot est peut-etre en train de demarrer : uvicorn met une quinzaine de
# secondes a prendre le port quand le referentiel se recharge. Un marqueur
# empeche deux gardiens successifs de lancer deux instances.
$marqueur = Join-Path $Dossier "data\gardien.demarrage"
if (Test-Path $marqueur) {
    $age = (Get-Date) - (Get-Item $marqueur).LastWriteTime
    if ($age.TotalSeconds -lt 120) { exit 0 }
}
New-Item -ItemType File -Path $marqueur -Force | Out-Null

# La memoire est la cause premiere des morts : on la note, pour qu'un jour on
# puisse relier « le bot est tombe » a « la machine etait pleine ».
$os = Get-CimInstance Win32_OperatingSystem
$libreMo = [int]($os.FreeVirtualMemory / 1024)
Ecrire-Journal "port $Port muet — relance (memoire virtuelle libre : $libreMo Mo)"

$env:PYTHONIOENCODING = "utf-8"
Start-Process -FilePath "python" `
    -ArgumentList "demarrer.py", "--sans-navigateur", "--port", $Port `
    -WorkingDirectory $Dossier -WindowStyle Hidden

Start-Sleep -Seconds 20
if (Port-Repond $Port) {
    Ecrire-Journal "releve — le bot repond sur $Port"
    Remove-Item $marqueur -Force -ErrorAction SilentlyContinue
    exit 0
}
Ecrire-Journal "ECHEC : toujours muet 20 s apres la relance"
exit 1

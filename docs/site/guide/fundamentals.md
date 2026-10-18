# Les fondamentaux

Cette page explique à quoi sert Pantin, comment il est construit, et comment le lancer. Elle s'adresse à un amateur ou à un automaticien : aucune connaissance en programmation n'est nécessaire.

## À quoi sert Pantin

Pantin simule une machine industrielle (cinématique et un peu de physique) qu'un vrai programme d'automate pilote en boucle fermée.

Le cas d'usage de départ : valider un programme d'automate sur une machine spéciale **avant** la mise en service.

La boucle fermée, c'est ceci :

1. l'automate écrit ses commandes (une bobine de distributeur, un contacteur) ;
2. Pantin déplace la machine simulée en conséquence ;
3. les capteurs simulés (fin de course, cellule) changent d'état ;
4. l'automate lit ces retours et décide de la suite.

Vous importez vos propres modèles 3D, vous les animez, puis vous reliez les tags de la machine à votre automate.

::: warning Vérifié sur un cas
Le pont est testé en boucle fermée avec un client Modbus de test. Un CODESYS Control Win V3 x64 réel a piloté l'exemple `plc-cylinder` le 18 octobre 2026 ([réglage](/guide/connect-a-plc#configurer-l-automate-codesys)). Les autres versions de CODESYS et les cibles WAGO ne sont pas vérifiées.
:::

## Les trois processus

Pantin n'est pas un seul programme. Il en lance trois, qui ne communiquent que par le réseau local de la machine.

```
  Navigateur                Cœur (Node)                 Pont (Python)
 ┌───────────┐  HTTP, SSE  ┌──────────────────┐  tags  ┌─────────────┐   Modbus TCP   ┌──────────┐
 │  Viewer   │ <---------> │ simulation       │ <----> │  esclave    │ <------------> │ Automate │
 │ (affiche, │             │ pas fixe 1/120 s │ WebSock│  Modbus     │                │ CODESYS  │
 │  édite)   │             │ tags, fichiers   │        │             │                │          │
 └───────────┘             └──────────────────┘        └─────────────┘                └──────────┘
```

- **Le cœur** contient toute la simulation : liaisons, préactionneurs, capteurs, produits, physique, tags. Il lit et écrit les fichiers du Pantin. Il tourne sans aucune fenêtre ouverte.
- **Le viewer** est la page web que vous ouvrez dans le navigateur. Il affiche l'état envoyé par le cœur et sert d'interface d'édition. Il ne calcule rien de la simulation.
- **Le pont automate** est un petit processus Python, lancé par le cœur à la demande (bouton **Démarrer** de la carte **Pont automate**). Il se présente à l'automate comme des modules d'entrées/sorties Modbus TCP.

### Pourquoi la simulation ne dépend pas du navigateur

Fermer l'onglet, le laisser en arrière-plan ou avoir un ordinateur lent n'a aucun effet sur la simulation. Le navigateur ne fait que regarder. Pour l'automate, c'est essentiel : une boucle de commande stable ne doit pas dépendre du taux d'images de l'écran.

## Un pas de temps fixe

Le cœur avance par pas fixes de **1/120 s** (environ 8,3 ms), quel que soit le taux d'images. Une commande écrite sur un tag prend effet au pas suivant.

Cela rend la simulation reproductible : les mêmes commandes donnent les mêmes résultats. L'affichage s'adapte, lui, à la vitesse de votre écran.

La barre de simulation du viewer permet de mettre en **Pause**, de **Reprendre**, d'avancer de **1 pas** ou de **10 pas**.

::: tip
Quand la simulation est en pause alors qu'un pont automate est connecté, l'automate voit une machine figée. Pantin vous le signale dans la **Console**.
:::

## Unités et axes

| Sujet | Dans le cœur et les fichiers | Dans l'interface |
| --- | --- | --- |
| Longueurs | mètres | millimètres |
| Angles | radians | degrés |
| Temps | secondes | secondes |
| Masses | kilogrammes | kilogrammes |

Les valeurs des tags sont en unités du système international (mètres, radians), pas en millimètres.

L'axe **Z pointe vers le haut**, comme dans un logiciel de CAO. Le viewer convertit vers le repère de son moteur 3D, vous n'avez pas à vous en occuper. À l'import d'un fichier 3D, vous indiquez l'unité du fichier (**mm**, **cm**, **m**, **in**) et son **Axe vertical** (**Z vers le haut (CAO)** ou **Y vers le haut (standard glTF)**).

## Un Pantin, c'est un dossier

Une machine simulée s'appelle un **Pantin**. C'est un dossier de fichiers texte, compatible avec git :

| Élément | Rôle |
| --- | --- |
| `pantin.json` | toute la machine : corps, liaisons, préactionneurs, actionneurs, capteurs, objets de convoyage |
| `meshes/` | les maillages 3D (fichiers `.glb` ou `.stl`) |
| `io.json` | la liste d'E/S : modules Modbus et voies reliant les tags aux variables de l'automate |

`io.json` n'existe qu'une fois les E/S configurées. Vous ne l'éditez pas à la main : le viewer le crée et le modifie.

Les Pantins sont rangés par défaut dans le dossier `pantin-projects` de votre dossier personnel (`~/pantin-projects`). Vous pouvez choisir un autre dossier au lancement du cœur avec l'option `--pantins-dir`.

Comme tout est du texte, vous pouvez versionner un Pantin avec git, comparer deux versions ou le partager. Le détail du format est dans le [guide du document Pantin](https://github.com/ProtoGulix/pantin/blob/develop/docs/guides/pantin-document.md).

## Local par défaut

Au démarrage, le cœur écoute **uniquement sur la machine locale** (`127.0.0.1`). Personne d'autre sur votre réseau ne peut s'y connecter.

Ouvrir le réseau est un choix explicite, et il reste limité au réseau local privé (décision [ADR 0004](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0004-network-exposure.md)) :

- le cœur refuse de démarrer sur une adresse publique ou sur `0.0.0.0` ;
- en mode réseau privé, il écoute sur **une seule adresse privée** que vous indiquez (`--listen`) ;
- toute connexion dont l'adresse source est hors des plages privées est fermée avant la moindre lecture ;
- une liste d'adresses autorisées (`--allow`) peut seulement restreindre l'accès, jamais l'élargir.

Pour le pont automate, la carte **Pont automate** propose le même choix : **Local uniquement (127.0.0.1)** ou **Réseau privé**, avec une **Adresse d'écoute** et la liste des **Automates autorisés (IP ou CIDR, séparés par des virgules)**. La marche à suivre est dans [Connecter un automate](/guide/connect-a-plc).

## Installer et démarrer

Prérequis : Node.js 24 ou plus récent, pnpm, et Python 3 pour le pont et la conversion STEP.

::: warning Non vérifié
Les versions minimales de Python et les prérequis système exacts ne sont pas détaillés ici. Consultez le fichier `README.md` du dépôt et les scripts `packages/bridge/setup.sh` et `packages/step-converter/setup.sh`.
:::

Depuis le dossier du dépôt :

```
pnpm install
pnpm setup:python
pnpm serve
```

- `pnpm install` installe les dépendances.
- `pnpm setup:python` prépare les environnements Python du pont automate et du convertisseur STEP.
- `pnpm serve` construit le viewer puis lance le cœur, qui sert aussi le viewer.

Le cœur affiche une ligne du type `Pantin core (local mode) on http://127.0.0.1:4800`. Ouvrez cette adresse dans votre navigateur : le port par défaut est **4800**. Pour en changer, lancez le cœur avec l'option `--port`.

L'écran d'**Accueil** vous propose de créer un Pantin (**Pantin vide** ou **Depuis un fichier 3D**) ou d'en ouvrir un existant.

## Et ensuite

- Construire un premier exemple pas à pas : [Tutoriel](/guide/tutorial).
- Préparer vos fichiers de CAO avant l'import : [Préparer ses modèles 3D](/guide/preparing-models).
- Comprendre les éléments d'une machine : [Le modèle d'un Pantin](/guide/model) (corps, assemblage, groupe, liaisons), puis [Grouper, dégrouper, déplacer un corps](/guide/groups), [Préactionneurs, actionneurs et capteurs](/guide/action-chain), [Produits et convoyage](/guide/conveying) et [Tags, défauts et liste d'E/S](/guide/tags).
- Relier un automate : [Connecter un automate](/guide/connect-a-plc).
- Quelque chose ne marche pas : [Dépannage](/guide/troubleshooting).

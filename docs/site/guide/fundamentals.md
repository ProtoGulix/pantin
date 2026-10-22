# Les fondamentaux

Cette page explique à quoi sert Pantin, comment il est construit et comment le lancer. Aucune connaissance en programmation n'est nécessaire.

## À quoi sert Pantin

Pantin simule une machine industrielle (ses mouvements et un peu de physique). Un vrai programme d'automate la pilote en boucle fermée.

Le but : valider un programme d'automate sur une machine spéciale **avant** la mise en service.

La boucle fermée fonctionne ainsi :

1. l'automate écrit ses commandes (une bobine de distributeur, un contacteur) ;
2. Pantin déplace la machine simulée en conséquence ;
3. les capteurs simulés (fin de course, cellule) changent d'état ;
4. l'automate lit ces retours et décide de la suite.

Vous importez vos modèles 3D, vous les animez, puis vous reliez les tags de la machine à votre automate. Un **signal** (« tag » dans le viewer et dans le reste de ce guide) est une valeur nommée de la machine : une commande que l'automate écrit, ou un retour qu'il lit.

## Les trois processus

Pantin se compose de trois processus. Ils communiquent par le réseau local de votre machine.

```
  Navigateur                Cœur (Node)                 Pont (Python)
 ┌───────────┐  HTTP, SSE  ┌──────────────────┐  tags  ┌─────────────┐   Modbus TCP   ┌──────────┐
 │  Viewer   │ <---------> │ simulation       │ <----> │  esclave    │ <------------> │ Automate │
 │ (affiche, │             │ pas fixe 1/120 s │ WebSock│  Modbus     │                │ CODESYS  │
 │  édite)   │             │ tags, fichiers   │        │             │                │          │
 └───────────┘             └──────────────────┘        └─────────────┘                └──────────┘
```

- **Le cœur** contient toute la simulation : liaisons, préactionneurs, capteurs, produits, physique, tags. Il lit et écrit les fichiers du Pantin. Il tourne sans fenêtre ouverte.
- **Le viewer** est la page web que vous ouvrez dans le navigateur. Il affiche l'état envoyé par le cœur et sert d'interface d'édition. Il ne calcule rien de la simulation.
- **Le pont automate** est un petit processus Python que le cœur lance à la demande (bouton **Démarrer** de la carte **Pont automate · Modbus TCP**). Il se présente à l'automate comme des modules d'entrées/sorties Modbus TCP.

### La simulation ne dépend pas du navigateur

Fermer l'onglet, le laisser en arrière-plan ou avoir un ordinateur lent n'a aucun effet sur la simulation. Le navigateur ne fait que regarder. L'automate a ainsi une machine stable en face de lui.

## Un pas de temps fixe

Le cœur avance par pas de **1/120 s** (environ 8,3 ms), quel que soit le taux d'images. Une commande écrite sur un tag prend effet au pas suivant.

Les mêmes commandes donnent donc les mêmes résultats. L'affichage s'adapte, lui, à la vitesse de votre écran.

La barre de simulation du viewer permet de mettre en **Pause**, de **Reprendre**, d'avancer de **1 pas** ou de **10 pas**. En pas à pas, le mode **Détaillé** de la **Console** écrit une ligne à chaque changement d'un capteur : voir [Le mode Détaillé](/reference/panels#le-mode-detaille).

::: tip
Quand la simulation est en pause et qu'un pont automate est connecté, l'automate voit une machine figée. La **Console** vous le signale.
:::

## Unités et axes

| Sujet | Dans le cœur et les fichiers | Dans l'interface |
| --- | --- | --- |
| Longueurs | mètres | millimètres |
| Angles | radians | degrés |
| Temps | secondes | secondes |
| Masses | kilogrammes | kilogrammes |

Les valeurs des tags sont en unités du système international (mètres, radians), pas en millimètres.

L'axe **Z pointe vers le haut**, comme dans un logiciel de CAO. Le viewer convertit vers le repère de son moteur 3D : vous n'avez rien à faire.

À l'import d'un STL, vous indiquez l'unité du fichier (**mm**, **cm**, **m**, **in**). Pour un GLB ou un STL, vous indiquez aussi l'**Axe vertical** (**Z vers le haut (CAO)** ou **Y vers le haut (standard glTF)**). Un STEP n'a rien à régler.

## Un Pantin, c'est un dossier

Une machine simulée s'appelle un **Pantin**. C'est un dossier de fichiers texte, compatible avec git :

| Élément | Rôle |
| --- | --- |
| `pantin.json` | toute la machine : corps, liaisons, préactionneurs, actionneurs, capteurs, objets de convoyage |
| `meshes/` | les maillages 3D (fichiers `.glb` ou `.stl`) |
| `io.json` | la liste d'E/S : modules Modbus et voies reliant les tags aux variables de l'automate |

`io.json` n'existe qu'une fois les E/S configurées. Vous ne l'éditez pas à la main : le viewer le crée et le modifie.

Les Pantins sont rangés par défaut dans le dossier `pantin-projects` de votre dossier personnel (`~/pantin-projects`). L'option `--pantins-dir` du cœur choisit un autre dossier.

Comme tout est du texte, vous pouvez versionner un Pantin avec git, comparer deux versions ou le partager. Le format est décrit dans le [guide du document Pantin](https://github.com/ProtoGulix/pantin/blob/develop/docs/guides/pantin-document.md).

### Modifier un fichier hors de Pantin

Un Pantin ouvert reste en mémoire dans le cœur. Si vous modifiez `pantin.json` ou `io.json` avec un éditeur de texte, un `git pull` ou `pantin io init --update`, le viewer ne le voit pas tout de suite. Pantin compare alors le disque à ce qu'il a lu, à deux moments seulement :

- quand la fenêtre du navigateur reprend le focus (vous revenez de votre éditeur ou de votre terminal) ;
- à l'enregistrement.

Un fichier modifié, créé ou supprimé en dehors de Pantin déclenche trois signes : un bandeau d'avertissement en haut de la zone centrale, avec un pictogramme, un texte et une bordure (la couleur n'est jamais le seul signal), un avertissement dans la **Console**, et un premier enregistrement refusé. Le texte du bandeau est **pantin.json modifié en dehors de Pantin. Enregistrer l'écrasera.** (avec `io.json`, ou **pantin.json et io.json modifiés en dehors de Pantin. Enregistrer les écrasera.** pour les deux). Pantin ne recharge rien seul et ne fusionne rien : vous choisissez.

![Le bandeau d'avertissement quand pantin.json a changé sur le disque](/screenshots/fr/external-edit-banner.webp)

- **Relire le fichier** (**Relire les fichiers** pour les deux) abandonne l'état en mémoire et relit le disque. S'il reste des modifications non enregistrées, une question de confirmation s'affiche d'abord.
- **Enregistrer** écrase la version du disque par celle de Pantin.

Un fichier touché sans que son contenu change (`touch`, ou un `git checkout` qui remet les mêmes octets) ne déclenche rien.

Pantin se fie à la taille et à la date de modification du fichier, puis au contenu quand l'une des deux a changé. Une modification qui garde la même taille et la même date n'est pas vue. La précision de la date sur FAT et sur les partages réseau n'est pas vérifiée.

## Local par défaut

Au démarrage, le cœur écoute **uniquement sur la machine locale** (`127.0.0.1`). Personne d'autre sur votre réseau ne peut s'y connecter.

Ouvrir le réseau est un choix explicite, limité au réseau local privé :

- le cœur refuse de démarrer sur une adresse publique ou sur `0.0.0.0` ;
- en mode réseau privé, il écoute sur **une seule adresse privée** que vous indiquez (`--listen`) ;
- toute connexion dont l'adresse source est hors des plages privées est fermée avant la moindre lecture ;
- une liste d'adresses autorisées (`--allow`) peut seulement restreindre l'accès, jamais l'élargir.

Pour le pont automate, la carte **Pont automate · Modbus TCP** propose le même choix : **Local uniquement (127.0.0.1)** ou **Réseau privé**, avec une **Adresse d'écoute** et la liste des **Automates autorisés (IP ou CIDR, séparés par des virgules)**. La marche à suivre est dans [Connecter un automate](/guide/connect-a-plc).

## Installer et démarrer

Prérequis : Node.js 24 ou plus récent, pnpm, et Python 3 pour le pont et la conversion STEP. Les détails sont dans le fichier `README.md` du dépôt.

Depuis le dossier du dépôt :

```
pnpm install
pnpm setup:python
pnpm serve
```

- `pnpm install` installe les dépendances.
- `pnpm setup:python` prépare les environnements Python du pont automate et du convertisseur STEP.
- `pnpm serve` construit le viewer puis lance le cœur, qui sert aussi le viewer.

Le cœur affiche une ligne du type `Pantin core (local mode) on http://127.0.0.1:4800`. Ouvrez cette adresse dans votre navigateur. Le port par défaut est **4800** ; l'option `--port` en choisit un autre.

Pour connaître la version utilisée, ouvrez **Aide**, **À propos de Pantin…** : la fenêtre donne la version du viewer et celle du cœur. La version du guide est affichée dans son en-tête, avec un lien vers l'historique des changements.

L'écran d'**Accueil** propose de créer un Pantin (**Pantin vide** ou **Depuis un fichier 3D**), de copier un des **Exemples** ou d'ouvrir un Pantin existant.

### Les exemples

La section **Exemples** de l'Accueil n'apparaît que si le cœur connaît le dossier des exemples. `pnpm serve` lui donne le dossier `examples` du dépôt avec l'option `--examples-dir`. Un cœur lancé sans cette option n'affiche pas la section :

```
node packages/core/src/main.ts --examples-dir examples
```

Au démarrage, le cœur écrit `Examples from <dossier>` ou `Examples disabled (no --examples-dir)`. Il refuse de démarrer si le chemin donné n'est pas un dossier.

## Et ensuite

- Construire un premier exemple pas à pas : [Tutoriel](/guide/tutorial).
- Préparer vos fichiers de CAO avant l'import : [Préparer ses fichiers de CAO](/guide/preparing-models).
- Comprendre les éléments d'une machine : [Le modèle d'un Pantin](/guide/model), puis [Grouper, dégrouper, déplacer un corps](/guide/groups), [Préactionneurs, actionneurs et capteurs](/guide/action-chain), [Produits et convoyage](/guide/conveying) et [Tags, défauts et liste d'E/S](/guide/tags).
- Relier un automate : [Connecter un automate](/guide/connect-a-plc).
- Quelque chose ne marche pas : [Dépannage](/guide/troubleshooting).

::: warning Limites connues
Un CODESYS Control Win V3 x64 a piloté l'exemple `plc-cylinder` en boucle fermée ([réglages](/guide/connect-a-plc#configurer-l-automate-codesys)). Les autres versions de CODESYS et les cibles WAGO n'ont pas été essayées.
:::

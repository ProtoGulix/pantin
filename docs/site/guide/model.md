# Le modèle d'un Pantin

Cette page pose les notions de base d'une machine Pantin : corps, assemblage, groupe et liaison. Les procédures et les autres éléments ont leur page, listée à la fin. Les noms entre **gras** sont ceux de l'interface.

Le principe général : une machine est un arbre de **corps** reliés par des **liaisons**. Une **chaîne d'action** (préactionneur puis actionneur) déplace les liaisons. Des **capteurs** lisent le résultat. L'automate ne parle qu'aux tags.

```
 automate ──tags──> préactionneur ──orifices──> actionneur ──> liaison ──> corps
    ^                                                             │
    └──────────tags────────── capteur <───────────────────────────┘
```

## Les concepts : corps, assemblage, groupe

Trois mots reviennent partout dans Pantin. Lisez cette section avant les procédures.

| Mot | Ce que c'est | Ce qu'il fait |
| --- | --- | --- |
| **Corps** | Un fichier de maillage 3D (un GLB, un STL, ou un composant d'un STEP). | Pantin ne le coupe ni ne le fusionne jamais : un fichier, un corps. Un corps n'a pas de tag. |
| **Assemblage** | Un noeud de l'arborescence de structure, comme dans un assemblage de CAO. | Il range des corps et d'autres assemblages. Il a un nom et une **clé**, qui sert de préfixe aux tags. |
| **Groupe** | Un assemblage utilisé comme extrémité d'une liaison. | Il forme **une seule pièce rigide** : tous ses corps bougent ensemble. |

Un groupe n'est pas un autre objet : c'est un assemblage dont on se sert dans une liaison. Le mot « groupe » dit ce qu'il fait ; le mot « assemblage » dit où il est rangé.

### La règle centrale

**Un corps sans liaison parente bouge avec son groupe.**

Dans un assemblage, un corps qui n'est l'enfant d'aucune liaison reste donc collé à son assemblage. Quand une liaison déplace l'assemblage, tous ces corps suivent, sans qu'il faille les relier un par un. Un corps qui a une liaison parente, lui, bouge par rapport à son parent, comme avant.

Deuxième règle : **l'arborescence ne porte jamais de mouvement, seules les liaisons en portent.** Ranger un assemblage dans un autre ne le fait pas suivre l'autre. Pour qu'un sous-assemblage suive son parent, ou glisse par rapport à lui, il faut une liaison entre les deux.

### Un exemple : le vérin

```
Pantin
└── assemblage « verin1 »             rangement, préfixe des tags
    ├── corps « corps »               sans liaison parente : suit « verin1 »
    └── groupe « Tige »               sous-assemblage, rigide
        ├── corps « tige »            sans liaison parente : suit « Tige »
        └── corps « chariot »         sans liaison parente : suit « Tige »

Liaison « Tige » :  verin1 ──glissière──> Tige
```

Une seule liaison fait glisser la tige et le chariot ensemble. Aucune liaison ne les relie entre eux.

### Ce qu'une liaison peut relier

Chaque extrémité d'une liaison (parent, enfant) est un **corps** ou un **groupe**. Dans le formulaire de liaison, la liste propose des corps et des entrées **Groupe : nom**.

| Cas | Règle |
| --- | --- |
| Entre deux assemblages | L'enfant est un **groupe**. Un corps enfant est refusé : le message propose son groupe. Le parent est un groupe ou un corps. |
| Dans un même assemblage | L'enfant est un **corps**. Le parent est un autre corps du même assemblage, ou le groupe lui-même (une bague qui tourne dans son palier). |
| Parent unique | Un corps ou un groupe a au plus une liaison qui l'amène à son parent. |
| Pas de boucle | Les liaisons ne forment jamais de boucle. Un groupe ne peut pas avoir pour parent l'un de ses propres corps. |

L'origine et l'axe d'une liaison sont exprimés dans le repère de l'assemblage du parent (le groupe lui-même quand le parent est un groupe). Les tags d'une liaison prennent la clé de l'assemblage qu'elle déplace : pour un groupe enfant, c'est la clé du groupe.

### Pourquoi cette organisation

Avant, l'import reliait chaque corps d'un assemblage à un corps « poignée » par une liaison fixe : une étoile de liaisons, du bruit dans l'arborescence, et une poignée choisie au hasard. Maintenant :

- un import ne crée aucune liaison dans un assemblage, seulement une liaison fixe par sous-assemblage, du groupe parent au groupe enfant ;
- pour animer un sous-assemblage, vous transformez cette seule liaison fixe en glissière ou en pivot ;
- quand l'import ne découpe pas assez (un STEP sans sous-assemblage), vous créez le groupe vous-même : voir [Faire un groupe](/guide/groups#faire-un-groupe).

Le menu d'un assemblage, dans l'arborescence, propose **Nouvelle liaison…**, **Masquer dans la vue 3D**, **Isoler dans la vue 3D** et **Afficher tous les assemblages**. Le menu du Pantin propose **Nouvel assemblage**. Tout élément (préactionneur, capteur, bande...) appartient à un assemblage, qui fournit le préfixe de ses tags.

## Les corps

Un **corps** est un maillage 3D importé. Pantin lit :

- le **STL** : un fichier donne un corps, sans unité ni hiérarchie ;
- le **GLB** (glTF) : les noms de noeuds sont conservés ;
- le **STEP** : converti en maillage par un processus séparé (OpenCascade).

Pour importer, utilisez **Fichier** puis **Importer…**, ou l'action **Importer dans ce Pantin** du menu d'un Pantin. Le formulaire demande l'**Unité** (STL seulement) et l'**Axe vertical** (GLB et STL), puis **Importer**. Un STEP n'a rien à régler : son unité est lue dans le fichier et l'axe Z est vers le haut. La conversion STEP peut prendre jusqu'à 2 minutes : gardez la page ouverte.

Un STEP qui contient des sous-assemblages nommés devient plusieurs corps et plusieurs assemblages. L'import ne crée aucune liaison à l'intérieur d'un assemblage : ses corps suivent l'assemblage. Il crée une liaison fixe par sous-assemblage, entre le groupe parent et le groupe enfant. Un STEP sans sous-assemblage donne un seul assemblage et aucune liaison. Les fichiers GLB et STL ne créent aucune liaison.

Pour préparer vos fichiers avant l'import (sous-assemblages, unités, noms), voir [Préparer ses modèles 3D](/guide/preparing-models).

::: warning Non vérifié
Le trajet complet d'un logiciel de CAO vers glTF avec les bons pivots n'a pas été validé sur une vraie pièce. Depuis un logiciel de CAO, préférez le STEP, et vérifiez le placement des corps après l'import.
:::

Un corps n'a pas de tag : il est déplacé par les liaisons, ou par son groupe (voir [la règle centrale](#la-regle-centrale)).

## Les liaisons

Une **liaison** relie un **Corps parent** à un **Corps enfant**, qui peuvent être des corps ou des groupes (voir [Ce qu'une liaison peut relier](#ce-qu-une-liaison-peut-relier)). Elle a une **origine**, un **axe** (repère de l'assemblage du parent, Z vers le haut) et, selon son type, des limites. Créez-la par **Édition** puis **Nouvelle liaison…** ou par le menu d'un assemblage dans l'arborescence.

| Type dans l'interface | Mouvement | Réglages propres |
| --- | --- | --- |
| **Fixe** | aucun | aucun |
| **Glissière** | translation le long de l'axe, avec course | **Limites** |
| **Pivot limité** | rotation autour de l'axe, avec butées | **Limites** |
| **Pivot continu** | rotation sans limite (tambour, roue) | aucun |
| **Hélicoïdale (vis et écrou)** | translation liée à une rotation | **Pas (course par tour)** |

La coordonnée d'une liaison est en mètres (glissière, hélicoïdale) ou en radians (pivots). Dans l'interface, vous la lisez en millimètres et en degrés.

Le bouton **Prendre l'axe sur une face** place l'axe d'après une face cliquée dans la vue 3D ; il n'est proposé que pour une liaison enregistrée dont le type bouge (voir [Panneaux et boutons](/reference/panels)). **Inverser l'axe** change le sens positif.

Un corps ou un groupe a au plus une liaison qui l'amène à son parent, et les liaisons ne forment jamais de boucle.

### Tags d'une liaison

Les tags d'une liaison utilisent l'assemblage qu'elle déplace : celui de son corps enfant, ou le groupe enfant lui-même.

| Tag | Direction | Quand |
| --- | --- | --- |
| `position` | retour | toujours, pour une liaison mobile |
| `setpoint` | commande | tant qu'aucun actionneur ne déplace la liaison |

Dès qu'un actionneur déplace une liaison, c'est lui qui la commande : le tag `setpoint` n'existe plus.

### Aperçu par curseur

Chaque liaison mobile a un curseur (**Position de « nom »**) pour la déplacer à la main et vérifier les butées.

## La suite

- [Grouper, dégrouper, déplacer un corps](/guide/groups) : les procédures de structure.
- [Préactionneurs, actionneurs et capteurs](/guide/action-chain) : la chaîne qui anime les liaisons.
- [Produits et convoyage](/guide/conveying) : bandes, émetteurs, cellules de présence.
- [Tags, défauts et liste d'E/S](/guide/tags) : ce que voit l'automate.
- [Tutoriel](/guide/tutorial) : le tout, pas à pas.

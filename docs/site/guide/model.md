# Le modèle d'un Pantin

Cette page définit les notions de base d'une machine Pantin : corps, assemblage, groupe et liaison. Les procédures et les autres éléments ont leur page, listée à la fin. Les noms en **gras** sont ceux de l'interface.

Une machine est un arbre de **corps** reliés par des **liaisons**. Une **chaîne d'action** (préactionneur, puis actionneur) déplace les liaisons. Des **capteurs** lisent le résultat. L'automate ne parle qu'aux tags.

```
 automate ──tags──> préactionneur ──orifices──> actionneur ──> liaison ──> corps
    ^                                                             │
    └──────────tags────────── capteur <───────────────────────────┘
```

## Les concepts : corps, assemblage, groupe

Ces trois mots reviennent partout dans Pantin.

| Mot | Ce que c'est | Ce qu'il fait |
| --- | --- | --- |
| **Corps** | Un maillage 3D : un fichier GLB, un fichier STL, ou une pièce d'un STEP. | Pantin ne le coupe ni ne le fusionne jamais : un fichier, un corps. Un corps n'a pas de tag. |
| **Assemblage** | Un nœud de l'arborescence de structure, comme un assemblage de CAO. | Il range des corps et d'autres assemblages. Il a un nom et une **clé**, qui sert de préfixe aux tags. |
| **Groupe** | Un assemblage qui sert d'extrémité à une liaison. | Il forme **une seule pièce rigide** : tous ses corps bougent ensemble. |

Un groupe n'est pas un autre objet : c'est un assemblage utilisé dans une liaison. Le mot « groupe » dit ce que l'assemblage fait ; le mot « assemblage » dit où il est rangé.

### La règle centrale

**Un corps sans liaison parente bouge avec son groupe.**

Un corps qui n'est l'enfant d'aucune liaison reste collé à son assemblage. Quand une liaison déplace l'assemblage, tous ces corps suivent, sans qu'il faille les relier un par un.

Un corps qui a une liaison parente bouge par rapport à son parent.

Seconde règle : **l'arborescence ne porte jamais de mouvement, seules les liaisons en portent.** Ranger un assemblage dans un autre ne le fait pas suivre l'autre. Pour qu'un sous-assemblage suive son parent, ou glisse par rapport à lui, il faut une liaison entre les deux.

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

Les corps d'un assemblage suivent l'assemblage : il n'y a pas de liaison à créer entre eux. Cela évite une étoile de liaisons fixes autour d'un corps choisi au hasard.

- Un import ne crée aucune liaison dans un assemblage. Il crée une liaison fixe par sous-assemblage, du groupe parent au groupe enfant.
- Pour animer un sous-assemblage, vous transformez cette liaison fixe en glissière ou en pivot.
- Quand l'import ne découpe pas assez (un STEP sans sous-assemblage), vous créez le groupe vous-même : voir [Faire un groupe](/guide/groups#faire-un-groupe).

Le menu d'un assemblage, dans l'arborescence, propose **Nouvelle liaison…**, **Masquer dans la vue 3D**, **Isoler dans la vue 3D** et **Afficher tous les assemblages**. Le menu du Pantin propose **Nouvel assemblage**. Tout élément (préactionneur, capteur, bande...) appartient à un assemblage, qui fournit le préfixe de ses tags.

## Les corps

Un **corps** est un maillage 3D importé. Pantin lit :

- le **STL** : un fichier donne un corps, sans unité ni hiérarchie ;
- le **GLB** (glTF) : les noms de nœuds sont conservés ;
- le **STEP** : converti en maillage par un processus séparé (OpenCascade).

Pour importer, utilisez **Fichier** puis **Importer…**, ou l'action **Importer dans ce Pantin** du menu d'un Pantin. Le formulaire demande l'**Unité** (STL seulement) et l'**Axe vertical** (GLB et STL), puis **Importer**. Un STEP n'a rien à régler : son unité est lue dans le fichier et l'axe Z est vers le haut. La conversion STEP peut prendre jusqu'à 2 minutes : gardez la page ouverte.

Ce que donne chaque format :

- Un STEP avec des sous-assemblages nommés donne plusieurs corps et plusieurs assemblages, avec une liaison fixe par sous-assemblage.
- Un STEP sans sous-assemblage donne un seul assemblage et aucune liaison.
- Un GLB ou un STL donne un corps et aucune liaison.

Pour préparer vos fichiers avant l'import, voir [Préparer ses fichiers de CAO](/guide/preparing-models).

Un corps n'a pas de tag : il est déplacé par les liaisons, ou par son groupe (voir [la règle centrale](#la-regle-centrale)).

## Les liaisons

Une **liaison** relie un **Corps parent** à un **Corps enfant**, qui peuvent être des corps ou des groupes (voir [Ce qu'une liaison peut relier](#ce-qu-une-liaison-peut-relier)). Elle a une **origine**, un **axe** (repère de l'assemblage du parent, Z vers le haut) et, selon son type, des limites. Créez-la par **Édition** puis **Nouvelle liaison…**, ou par le menu d'un assemblage dans l'arborescence.

| Type dans l'interface | Mouvement | Réglages propres |
| --- | --- | --- |
| **Fixe** | aucun | aucun |
| **Glissière** | translation le long de l'axe, avec course | **Limites** |
| **Pivot limité** | rotation autour de l'axe, avec butées | **Limites** |
| **Pivot continu** | rotation sans limite (tambour, roue) | aucun |
| **Hélicoïdale (vis et écrou)** | translation liée à une rotation | **Pas (course par tour)** |

La coordonnée d'une liaison est en mètres (glissière, hélicoïdale) ou en radians (pivots). Dans l'interface, vous la lisez en millimètres et en degrés.

Le bouton **Prendre l'axe sur une face** place l'axe d'après une face cliquée dans la vue 3D. **Inverser l'axe** change le sens positif. Le premier n'est proposé que pour une liaison enregistrée dont le type bouge (voir [Panneaux et boutons](/reference/panels)).

### Dans quel repère se lit une liaison

L'origine et l'axe d'une liaison se lisent dans le repère de l'assemblage de son **parent** (le groupe lui-même quand le parent est un groupe). Ce n'est pas le repère du groupe qu'elle déplace.

Le trièdre affiché dans la vue 3D, quand une liaison est sélectionnée, est ce repère. Tourner le repère du groupe déplacé ne change donc jamais les nombres de sa liaison.

Un axe incliné (des rails à 70°, par exemple) se lit alors `[0, 0, 1]` après **Aligner le repère sur cet axe**, sans rien déplacer :

- La commande est dans le formulaire de la liaison. Elle n'est proposée que pour une liaison déjà créée dont le type bouge, jamais pour une liaison **Fixe**.
- Elle est grisée tant que le formulaire a des modifications non appliquées. Cliquez d'abord **Appliquer** : elle utilise l'axe enregistré dans le document.
- Elle tourne le repère de l'assemblage du parent et celui du groupe que la liaison déplace. Aucun corps ne bouge.
- Le message nomme les assemblages tournés et les liaisons dont les nombres ont changé. Les autres liaisons du même parent sont réécrites aussi, puisqu'elles se lisent dans le même repère.
- Si rien n'a changé, le message est **Les repères sont déjà alignés sur cet axe, rien n'a changé.**

Avec un parent volumineux, la liste peut être longue : groupez d'abord les rails pour obtenir un petit parent (voir [Grouper](/guide/groups)). La marche à suivre pour des glissières inclinées est dans [Préparer ses fichiers de CAO](/guide/preparing-models#aligner-le-repere-de-chaque-sous-assemblage-mobile-sur-son-mouvement).

### Tags d'une liaison

Les tags d'une liaison utilisent l'assemblage qu'elle déplace : celui de son corps enfant, ou le groupe enfant lui-même.

| Tag | Direction | Quand |
| --- | --- | --- |
| `position` | retour | toujours, pour une liaison mobile |
| `setpoint` | commande | tant qu'aucun actionneur ne déplace la liaison |

Dès qu'un actionneur déplace une liaison, c'est lui qui la commande : le tag `setpoint` n'existe pas.

### Aperçu par curseur

Chaque liaison mobile a un curseur (**Position de « nom »**) pour la déplacer à la main et vérifier les butées.

## La suite

- [Grouper, dégrouper, déplacer un corps](/guide/groups) : les procédures de structure.
- [Préactionneurs, actionneurs et capteurs](/guide/action-chain) : la chaîne qui anime les liaisons.
- [Produits et convoyage](/guide/conveying) : bandes, émetteurs, cellules de présence.
- [Tags, défauts et liste d'E/S](/guide/tags) : ce que voit l'automate.
- [Tutoriel](/guide/tutorial) : le tout, pas à pas.

::: warning Limites connues
Le trajet complet d'un logiciel de CAO vers glTF, avec les bons pivots, n'a pas été essayé sur une vraie pièce. Depuis un logiciel de CAO, préférez le STEP et vérifiez le placement des corps après l'import.
:::

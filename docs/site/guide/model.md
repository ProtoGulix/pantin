# Le modèle d'un Pantin

Cette page décrit chaque élément d'une machine Pantin : ce qu'il est, ce que vous réglez dans le viewer, et les **tags** qu'il produit pour l'automate. Les noms entre **gras** sont ceux de l'interface.

Le principe général : une machine est un arbre de **corps** reliés par des **liaisons**. Une **chaîne d'action** (préactionneur puis actionneur) déplace les liaisons. Des **capteurs** lisent le résultat. L'automate ne parle qu'aux tags.

```
 automate ──tags──> préactionneur ──orifices──> actionneur ──> liaison ──> corps
    ^                                                             │
    └──────────tags────────── capteur <───────────────────────────┘
```

## Les assemblages

Un **assemblage** regroupe des corps, comme dans un assemblage de CAO. Il a un nom et une **clé**, qui sert de préfixe aux tags de ses éléments. Un assemblage peut en contenir un autre. Cette structure ne déplace rien : elle sert à ranger et à nommer.

Dans l'arborescence, le menu du Pantin propose **Nouvel assemblage**. Le menu d'un assemblage propose **Nouvelle liaison…**, **Masquer dans la vue 3D**, **Isoler dans la vue 3D** et **Afficher tous les assemblages**.

Tout élément (préactionneur, capteur, bande...) appartient à un assemblage. C'est lui qui fournit le préfixe de ses tags.

## Les corps

Un **corps** est un maillage 3D importé. Pantin lit :

- le **STL** : un fichier donne un corps, sans unité ni hiérarchie ;
- le **GLB** (glTF) : les noms de noeuds sont conservés ;
- le **STEP** : converti en maillage par un processus séparé (OpenCascade).

Pour importer, utilisez **Fichier** puis **Importer…**, ou l'action **Importer dans ce Pantin** du menu d'un Pantin. Le formulaire demande l'**Unité** du fichier et son **Axe vertical**, puis **Importer**. La conversion STEP peut prendre jusqu'à 2 minutes : gardez la page ouverte.

Un STEP qui contient un assemblage nommé peut devenir plusieurs corps et plusieurs assemblages.

::: warning Non vérifié
Le trajet complet ZW3D vers glTF avec les bons pivots n'a pas été validé sur une vraie pièce. Pour un export depuis ZW3D, préférez le STEP, et vérifiez le placement des corps après l'import.
:::

Un corps n'a pas de tag : il est déplacé par les liaisons.

## Les liaisons

Une **liaison** relie un **Corps parent** à un **Corps enfant**. Elle a une **origine**, un **axe** (repère du corps parent, Z vers le haut) et, selon son type, des limites. Créez-la par **Édition** puis **Nouvelle liaison…** ou par le menu d'un assemblage dans l'arborescence.

| Type dans l'interface | Mouvement | Réglages propres |
| --- | --- | --- |
| **Fixe** | aucun | aucun |
| **Glissière** | translation le long de l'axe, avec course | **Limites** |
| **Pivot limité** | rotation autour de l'axe, avec butées | **Limites** |
| **Pivot continu** | rotation sans limite (tambour, roue) | aucun |
| **Hélicoïdale (vis et écrou)** | translation liée à une rotation | **Pas (course par tour)** |

La coordonnée d'une liaison est en mètres (glissière, hélicoïdale) ou en radians (pivots). Dans l'interface, vous la lisez en millimètres et en degrés.

Le bouton **Prendre l'axe sur une face** place l'axe d'après une face cliquée dans la vue 3D. **Inverser l'axe** change le sens positif.

Un corps a au plus une liaison qui l'amène à son parent, et les liaisons ne forment jamais de boucle.

### Tags d'une liaison

Les tags d'une liaison utilisent l'assemblage de son corps enfant.

| Tag | Direction | Quand |
| --- | --- | --- |
| `position` | retour | toujours, pour une liaison mobile |
| `setpoint` | commande | tant qu'aucun actionneur ne déplace la liaison |

Dès qu'un actionneur déplace une liaison, c'est lui qui la commande : le tag `setpoint` n'existe plus.

### Aperçu par curseur

Chaque liaison mobile a un curseur (**Position de « nom »**) pour la déplacer à la main et vérifier les butées.

## La chaîne d'action

Ni le préactionneur ni l'actionneur n'est une pièce 3D. Ensemble, ils transforment une commande de l'automate en mouvement.

### Les préactionneurs

Le **préactionneur** est l'appareil que l'automate commande : distributeur, contacteur, variateur. Il porte les tags de commande et de retour. Il ne déplace rien lui-même : ses **orifices** de sortie alimentent des actionneurs.

Créez-le avec **Nouveau préactionneur** (section **Préactionneurs**) : vous donnez un **Nom**, un **Type** et l'assemblage où naissent ses tags (**Tags dans l'assemblage**).

| Type | Tags produits (direction vue de l'automate) | Orifices de sortie |
| --- | --- | --- |
| **Distributeur 3/2, monostable** | `coil_12` (commande, bit) | Orifice 2 |
| **Double distributeur 3/2** | `coil_14`, `coil_12` (commande, bit) | Orifices 2 et 4 |
| **Distributeur 5/2, monostable** | `coil_14` (commande, bit) | Orifices 2 et 4 |
| **Distributeur 5/2, bistable** | `coil_14`, `coil_12` (commande, bit) | Orifices 2 et 4 |
| **Distributeur 5/3, centre fermé** | `coil_14`, `coil_12` (commande, bit) | Orifices 2 et 4 |
| **Distributeur 5/3, centre ouvert à l'échappement** | `coil_14`, `coil_12` (commande, bit) | Orifices 2 et 4 |
| **Distributeur 5/3, centre en pression** | `coil_14`, `coil_12` (commande, bit) | Orifices 2 et 4 |
| **Contacteur** | `run` (commande, bit) | Sortie |
| **Contacteur inverseur** | `forward`, `reverse` (commande, bit) | Sortie |
| **Variateur, marche/arrêt** | `run`, `reverse` (commande, bit) ; `speed` (retour, flottant) | Sortie |
| **Variateur, consigne analogique** | `speed_setpoint` (commande) ; `speed` (retour) | Sortie |
| **Variateur d'axe asservi** | `setpoint` (commande, position) ; `position` (retour) | Sortie |

Les orifices sont typés : pneumatique, puissance ou servo. Un actionneur ne se branche que sur des orifices du bon type.

Si deux commandes contradictoires sont actives (les deux bobines d'un distributeur 5/3, marche avant et arrière d'un contacteur inverseur), l'inspecteur l'indique dans **Diagnostic**. Ce n'est pas un tag.

### Les actionneurs

L'**actionneur** lit les orifices d'un préactionneur et déplace une ou plusieurs liaisons. Il n'a **aucun tag**. Créez-le avec **Nouvel actionneur** : choisissez le **Préactionneur qui l'alimente** et les **Liaisons qu'il déplace**.

| Type | Entrées | Réglages |
| --- | --- | --- |
| **Vérin simple effet** | **Chambre fond (sortie)** | **Vitesse de sortie**, **Vitesse de rappel** |
| **Vérin double effet** | **Chambre fond (sortie)**, **Chambre tige (rentrée)** | **Vitesse de sortie**, **Vitesse de rentrée** |
| **Moteur alternatif** | **Alimentation** | **Vitesse nominale** |
| **Servomoteur** | **Entrée servo** | aucun |

Une liaison est déplacée par un seul actionneur. Un actionneur déplace des liaisons mobiles, toutes dans la même unité (mètres ou radians). L'application refuse un préactionneur qui ne peut pas alimenter toutes les entrées de l'actionneur.

Un menu sur une liaison offre aussi **Ajouter un actionneur…**.

## Les capteurs

Un **capteur** surveille une liaison (**Liaison surveillée**) et donne son état à l'automate par ses tags. Il ne simule pas de physique. Créez-le avec **Nouveau capteur**, ou depuis le menu d'une liaison par **Ajouter un capteur…** ou **Ajouter les fins de course**.

| Type | Tag (retour) |
| --- | --- |
| **Contact idéal** | `state` (bit) |
| **Fin de course mécanique** | `state` (bit) |
| **Détecteur de vérin (magnétique)** | `state` (bit) |
| **Détecteur inductif (axial)** | `state` (bit) |
| **Codeur** | `count` (entier, comptage d'impulsions) |

Les détecteurs offrent entre autres l'option **Normalement fermé**, qui inverse le contact. Le détecteur inductif tient compte de la **Matière de la cible** pour sa portée réelle.

## Produits, convoyage et cellules de présence

Les objets de convoyage se créent depuis la famille **Convoyage** de l'arborescence (**Nouvelle bande**, **Nouveau guide**, **Nouvel émetteur**, **Nouvel absorbeur**, **Nouvelle cellule de présence**). Ils demandent d'abord un assemblage.

| Objet | Rôle |
| --- | --- |
| **Bande** | surface de convoyeur droite (**Longueur** par **Largeur**), entraînée par un **Tambour (liaison pivot continu)** de **Rayon du tambour** donné |
| **Guide** | boîte que les produits ne traversent pas (rail latéral, butée) |
| **Émetteur** | crée une boîte (**Masse**, **Matériau**) quand le tag `spawn` passe à 1 |
| **Absorbeur** | détruit les produits dont le centre entre dans son volume |
| **Cellule de présence** | détecte les produits par un rayon, au lieu de surveiller une liaison |

Le produit n'est jamais enregistré : il n'existe que pendant que le cœur tourne. Le bouton **Créer un produit** de l'émetteur écrit 1 puis 0 sur son tag `spawn`.

La chaîne d'une bande est : un préactionneur (par exemple un **Contacteur**) alimente un actionneur (par exemple un **Moteur alternatif**), qui déplace la liaison du tambour, que la bande nomme.

| Tag | Propriétaire | Direction |
| --- | --- | --- |
| `spawn` | émetteur | commande (bit) |
| `state` | cellule de présence | retour (bit) |

La **Cellule photoélectrique** a deux modes, **Réflex** et **Barrage**, une **Portée**, **Normalement fermé**, et deux retards (**Retard à l'enclenchement**, **Retard au déclenchement**). Elle lance son rayon le long de l'axe Z de son repère.

Les bandes, guides et absorbeurs n'ont pas de tag.

::: warning Limites connues
Seule la bande droite est vérifiée. Les convoyeurs courbes, les rouleaux, les transferts entre bandes et les longues simulations ne sont **pas** vérifiés. Les produits sont des boîtes.
:::

## Les tags

Un tag porte un nom de la forme :

```
assemblage.clé.membre
```

Par exemple `pince.valve.coil_14`. La clé vient du nom de l'élément. Elle ne change que si vous la renommez vous-même : renommer un élément ne casse donc jamais le programme de l'automate.

Chaque tag a :

- un **type** : bit, entier ou flottant (un bit n'accepte que 0 ou 1) ;
- une **direction vue de l'automate** : **commande** (l'automate écrit) ou **retour** (l'automate lit). Un retour ne peut pas être écrit.

Dans l'inspecteur, les tags d'un élément sont groupés en **Commandes** et **Retours**. Une commande écrite prend effet au pas suivant (1/120 s).

### Forcer et relâcher un tag

Quand vous écrivez une commande depuis le viewer (bouton **Envoyer**), le tag est **forcé** : un badge **forcé** apparaît. Tant qu'il est forcé, les écritures de l'automate sur ce tag sont ignorées, et la **Console** le note.

Pour rendre la main à l'automate, utilisez **Relâcher** sur le tag, ou **Relâcher tout** ou **Relâcher tous les tags forcés** (menu **Édition**). Un tag relâché reprend la dernière valeur écrite par l'automate, s'il en a écrit une.

::: tip
Forcer sert à tester sans automate : vous commandez la machine à la main, comme un opérateur de maintenance.
:::

## Les défauts injectables

Deux défauts permettent de tester la réaction de l'automate. Ils se règlent dans le groupe **Défauts** de l'inspecteur.

- **Ne répond plus** : le préactionneur ignore les commandes.
- **Grippée** : la liaison ne bouge plus. Le défaut est porté par la liaison, pas par l'actionneur.

Les défauts et les produits sont effacés par **Remise à zéro de la simulation** (menu **Édition**). Les modifications non enregistrées et l'horloge restent.

## La liste d'E/S (io.json)

Le fichier `io.json` relie les tags aux variables de l'automate et aux adresses Modbus. Il **ne définit jamais** un tag : les tags viennent du Pantin. Il ne contient que :

- des **modules** Modbus, chacun avec sa **Clé**, son **Port**, son **Adresse d'unité**, son **Ordre des mots** et son **Chien de garde (ms)** ;
- des **voies** : un **Tag**, une **Variable**, une **Zone**, une **Adresse** et un **Type**.

Ouvrez la vue **E/S seules** (menu **Affichage**). Si le Pantin n'a pas encore de liste, **Créer le mapping**. Vous pouvez **Ajouter un module**, **Affecter** les **Tags non affectés** à un module, **Réaffecter** ou **Retirer** une voie. Les problèmes apparaissent dans **Problèmes**.

**Exporter la GVL** télécharge la liste de variables globales CODESYS correspondante. Si un tag est renommé, sa voie suit ; le nom de la variable ne change jamais.

La suite, pour brancher réellement l'automate, est dans [Connecter un automate](/guide/connect-a-plc). Le détail du format est dans [ADR 0049](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0049-one-io-json-edited-from-the-viewer.md).

Pour manipuler tout cela pas à pas, suivez le [Tutoriel](/guide/tutorial).

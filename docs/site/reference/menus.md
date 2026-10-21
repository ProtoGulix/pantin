# Menus

La barre de menus contient quatre menus : **Fichier**, **Édition**, **Affichage** et **Aide**. Chaque entrée, dans l'ordre où elle apparaît ; un séparateur est une ligne « séparateur ».

Une entrée grisée ne fait rien, ni son raccourci. Une entrée à case (•) est cochable : la puce montre l'état. Voir [Raccourcis](/reference/shortcuts) pour la navigation au clavier dans les menus.

::: info Ctrl ou Cmd
Les menus affichent « Ctrl+... » ; sur macOS, <kbd>Cmd</kbd> convient aussi.
:::

Termes utilisés dans la colonne « Grisé quand » :

- **Pas de Pantin ouvert** : aucun Pantin n'est ouvert (la fenêtre d'accueil est affichée).
- **Traitement en cours** : une requête vers le coeur est en cours (l'indicateur de traitement de la barre d'outils est affiché).

## Fichier

| Entrée | Raccourci | Ce qu'elle fait | Grisé quand |
|---|---|---|---|
| **Accueil** | | Affiche la fenêtre d'accueil. | Un Pantin est ouvert. |
| **Ouvrir…** | | Avec un Pantin ouvert, le ferme pour revenir à la fenêtre d'accueil : s'il a des modifications non enregistrées, une question de confirmation s'affiche. La fenêtre d'accueil s'ouvre alors sur le dernier onglet utilisé (**Accueil** au premier affichage). Sans Pantin ouvert, affiche la fenêtre d'accueil sur l'onglet **Tous les Pantins**. | Traitement en cours. |
| **Enregistrer** | <kbd>Ctrl</kbd>+<kbd>S</kbd> | Enregistre le Pantin ouvert. Si `pantin.json` ou `io.json` a changé en dehors de Pantin, le premier enregistrement est refusé avec une explication ; le suivant écrase le disque (voir le [bandeau](/reference/panels#le-bandeau-de-modification-externe)). | Pas de Pantin ouvert, ni modification non enregistrée ni fichier modifié en dehors de Pantin, ou traitement en cours. |
| **Importer…** | | Ouvre le sélecteur de fichiers pour importer un modèle 3D (GLB, STL, STEP) dans le Pantin ouvert. | Pas de Pantin ouvert, traitement en cours, ou import déjà en cours. |
| **Nettoyer les fichiers orphelins…** | | Propose de supprimer les fichiers orphelins du dossier meshes du Pantin, que aucun corps n'utilise (après confirmation). | Mêmes conditions que **Importer…**. |
| séparateur | | | |
| **Fermer** | | Ferme le Pantin et revient à l'accueil. Une question s'affiche s'il reste des modifications non enregistrées. | Pas de Pantin ouvert. |

## Édition

| Entrée | Raccourci | Ce qu'elle fait | Grisé quand |
|---|---|---|---|
| **Nouvelle liaison…** | | Ouvre le formulaire de création d'une liaison. | Pas de Pantin ouvert, aucun corps dans le Pantin, ou traitement en cours. |
| **Grouper…** | | Crée un groupe avec les corps et sous-groupes sélectionnés dans l'arborescence : une ligne demande le nom du groupe. Voir [Faire un groupe](/guide/groups#faire-un-groupe). | La sélection n'est pas faite de corps et de sous-groupes d'un même assemblage, ou traitement en cours. |
| **Dégrouper** | | Dissout le groupe sélectionné dans l'assemblage où il est rangé. Voir [Défaire un groupe](/guide/groups#defaire-un-groupe). | La ligne sélectionnée n'est pas un assemblage rangé dans un autre assemblage, ou traitement en cours. |
| **Supprimer les liaisons fixes redondantes…** | | Liste les liaisons fixes devenues inutiles (entre corps d'un même assemblage, sans liaison mobile au-dessus du parent) et les supprime après confirmation. Agit sur tout le Pantin. Voir [Nettoyer les anciennes liaisons fixes](/guide/groups#nettoyer-les-anciennes-liaisons-fixes). | Pas de Pantin ouvert, import en cours ou traitement en cours. |
| **Remise à zéro de la simulation** | | Remet la simulation à son état initial. | Pas de Pantin ouvert ou traitement en cours. |
| **Relâcher tous les tags forcés** | | Relâche tous les tags forcés depuis le viewer. Sans effet si aucun tag n'est forcé. | Pas de Pantin ouvert ou traitement en cours. |
| séparateur | | | |
| **Renommer** | <kbd>F2</kbd> | Renomme l'élément sélectionné. | La sélection n'est ni un Pantin, ni un corps, ni un élément de la chaîne d'action (préactionneur, actionneur, capteur, bande...). Un assemblage ne se renomme pas par ce menu : utilisez <kbd>F2</kbd> dans l'arborescence ou son menu contextuel. |
| **Supprimer** | <kbd>Suppr</kbd> | Supprime l'élément sélectionné (corps, liaison ou élément de la chaîne d'action). Pour un corps, une liaison, un préactionneur, un actionneur ou un capteur, une question de confirmation s'affiche. Un préactionneur encore relié à un actionneur est refusé par le coeur. | La sélection n'est ni un corps, ni une liaison, ni un élément de la chaîne d'action, ou traitement en cours. |
| séparateur | | | |
| **Déplacer** (case) | <kbd>G</kbd> | Active ou coupe le manipulateur de déplacement de l'assemblage sélectionné. Avec un corps sélectionné, la sélection passe à son assemblage. | Aucun assemblage utilisable n'est sélectionné. |
| **Tourner** (case) | <kbd>R</kbd> | Active ou coupe le manipulateur de rotation. | Idem. |
| **Repère local de l'assemblage** (case) | <kbd>L</kbd> | Coché : le manipulateur suit les axes propres de l'assemblage. Décoché : il suit les axes du monde. | Idem. |
| **Aligner…** (case) | <kbd>A</kbd> | Démarre ou coupe l'outil d'alignement de l'assemblage sélectionné. | Aucun assemblage utilisable n'est sélectionné et aucun alignement n'est en cours. |

Les outils **Déplacer**, **Tourner** et **Aligner…** sont détaillés dans [Panneaux et boutons](/reference/panels).

## Affichage

| Entrée | Raccourci | Ce qu'elle fait | Grisé quand |
|---|---|---|---|
| **Tout cadrer** | <kbd>F</kbd> | Cadre la vue 3D sur tous les corps. | Aucun corps, ou la vue 3D n'est pas affichée (la vue 3D n'est affichée dans aucune zone). |
| **Cadrer la sélection** | | Cadre la vue 3D sur l'élément sélectionné. | Aucun corps, aucune sélection, sélection d'un élément de la chaîne d'action, ou vue 3D non affichée. |
| séparateur | | | |
| **Face** | <kbd>Ctrl</kbd>+<kbd>1</kbd> | Tourne la caméra vers la vue de face, en 300 ms. | Pas de Pantin ouvert ou vue 3D non affichée. |
| **Arrière** | <kbd>Ctrl</kbd>+<kbd>2</kbd> | Vue arrière. | Idem. |
| **Gauche** | <kbd>Ctrl</kbd>+<kbd>3</kbd> | Vue de gauche. | Idem. |
| **Droite** | <kbd>Ctrl</kbd>+<kbd>4</kbd> | Vue de droite. | Idem. |
| **Dessus** | <kbd>Ctrl</kbd>+<kbd>5</kbd> | Vue de dessus. | Idem. |
| **Dessous** | <kbd>Ctrl</kbd>+<kbd>6</kbd> | Vue de dessous. | Idem. |
| **Isométrique** | <kbd>Ctrl</kbd>+<kbd>7</kbd> | Vue isométrique. | Idem. |
| **Vue normale à une face** (case) | <kbd>Ctrl</kbd>+<kbd>8</kbd> | Attend un clic sur une face d'un corps dans la vue 3D, puis place la caméra de face devant elle. La ligne de message dit : **Cliquez sur une face dans la vue 3D pour la regarder de face. Échap annule.** <kbd>Échap</kbd> ou la même commande annule l'attente. Coché pendant l'attente. | Idem. |
| **Vue précédente** | <kbd>Ctrl</kbd>+<kbd>Maj</kbd>+<kbd>Z</kbd> | Remet la vue précédente de la caméra (angles, cible et zoom), jusqu'à 50 vues en arrière. Dans un champ de saisie, ce raccourci garde son sens de rétablissement du champ. | Idem. |
| séparateur | | | |
| **Inspecteur** (case) | | Affiche ou masque l'inspecteur. Coché quand il est affiché. | Pas de Pantin ouvert. |
| **Console** (case) | <kbd>F8</kbd> | Affiche ou masque la console. | Pas de Pantin ouvert. |
| séparateur | | | |
| **Vue suivante de la zone du haut** | <kbd>F4</kbd> | Passe la zone du haut à la vue suivante, dans l'ordre **3D**, **Schéma**, **Liaisons**, **E/S**, puis de nouveau **3D**, en sautant la vue que la zone du bas affiche. | Pas de Pantin ouvert. |
| **Zone du haut : 3D** (case) | | Affiche cette vue dans la zone du haut. Coché pour la vue actuelle de cette zone. | Pas de Pantin ouvert, ou la vue est déjà affichée dans la zone du bas. |
| **Zone du haut : Schéma** (case) | | Idem. | Idem. |
| **Zone du haut : Liaisons** (case) | | Idem. | Idem. |
| **Zone du haut : E/S** (case) | | Idem. | Idem. |
| **Zone du bas : 3D** (case) | | Affiche cette vue dans la zone du bas, et ouvre cette zone si elle est fermée. | Pas de Pantin ouvert, ou la vue est déjà affichée dans la zone du haut. |
| **Zone du bas : Schéma** (case) | | Idem. | Idem. |
| **Zone du bas : Liaisons** (case) | | Idem. | Idem. |
| **Zone du bas : E/S** (case) | | Idem. | Idem. |
| **Ouvrir la zone du bas** | | Ouvre la zone du bas, sur la première vue que la zone du haut n'affiche pas. | Pas de Pantin ouvert, ou la zone du bas est déjà ouverte. |
| **Fermer la zone du bas** | | Ferme la zone du bas. | Pas de Pantin ouvert, ou la zone du bas est déjà fermée. |
| séparateur | | | |
| **Perspective** (case) | | Bascule la caméra entre perspective et projection orthographique. | Jamais. |
| **Souris : SolidWorks** (case) | | Choisit la configuration de souris SolidWorks. | Jamais. |
| **Souris : ZW3D** (case) | | Choisit la configuration de souris ZW3D. | Jamais. |
| **Inverser le sens de la molette** (case) | | Inverse le sens du zoom à la molette. | Jamais. |
| **Pas des flèches : 5°** (case) | | Les flèches du clavier tournent la vue de 5° dans la vue 3D. | Jamais. |
| **Pas des flèches : 15°** (case) | | Idem, 15°. | Jamais. |
| **Pas des flèches : 45°** (case) | | Idem, 45°. | Jamais. |
| séparateur | | | |
| **Langue : FR** (case) | | Passe l'interface en français. | Jamais. |
| **Langue : EN** (case) | | Passe l'interface en anglais. | Jamais. |
| **Thème : Système** (case) | | Suit le thème clair ou sombre du navigateur ; c'est le réglage par défaut. | Jamais. |
| **Thème : Clair** (case) | | Force le thème clair. | Jamais. |
| **Thème : Sombre** (case) | | Force le thème sombre. | Jamais. |

Les réglages de souris sont détaillés dans [Raccourcis](/reference/shortcuts#vue-3d-et-navigation-de-la-camera).

## Aide

| Entrée | Raccourci | Ce qu'elle fait | Grisé quand |
|---|---|---|---|
| **Documentation** | | Ouvre ce guide dans un nouvel onglet, dans la langue du viewer. | Jamais. |
| **À propos de Pantin…** | | Ouvre la fenêtre **À propos de Pantin**. Voir [Panneaux et boutons](/reference/panels#la-fenetre-a-propos). | Jamais. |

## Menu contextuel de l'arborescence

Un clic droit sur une ligne de l'arborescence, ou la touche <kbd>Menu</kbd> ou <kbd>Maj</kbd>+<kbd>F10</kbd> du clavier, ouvre le menu de cette ligne. Un clic droit sur un groupe, un corps ou une liaison de la [vue Liaisons](/reference/views#la-vue-liaisons), ou <kbd>Maj</kbd>+<kbd>F10</kbd> sur l'un d'eux, ouvre le même menu. Son titre est « Actions sur « nom » ». Les entrées dépendent du type de ligne :

| Type de ligne | Entrées, dans l'ordre |
|---|---|
| Pantin | **Renommer**, **Cadrer la vue sur l'élément**, **Importer dans ce Pantin**, **Nouvel assemblage**, **Supprimer les liaisons fixes redondantes…** |
| Assemblage | **Renommer**, **Cadrer la vue sur l'élément**, **Nouvelle liaison…**, **Grouper…** (si la sélection s'y prête), **Dégrouper** (assemblage rangé dans un autre), **Masquer dans la vue 3D** (devient **Afficher dans la vue 3D** s'il est masqué), **Isoler dans la vue 3D** (devient **Afficher tous les assemblages** s'il est isolé), **Supprimer** |
| Dossier « Liaisons entre assemblages » | **Cadrer la vue sur l'élément**, **Nouvelle liaison…** |
| Corps | **Renommer**, **Cadrer la vue sur l'élément**, **Grouper…** (si la sélection s'y prête), **Supprimer** |
| Liaison | **Cadrer la vue sur l'élément**, **Changer le type…**, **Ajouter un actionneur…** (devient **Modifier son actionneur…** si elle en a un), **Ajouter un capteur…**, **Ajouter les fins de course**, **Supprimer** |
| Élément de la chaîne d'action (préactionneur, actionneur, capteur, bande...) | **Modifier**, **Afficher dans E/S**, **Supprimer** |
| Autres lignes (noeud du fichier source, famille d'éléments) | **Cadrer la vue sur l'élément** |

Précisions :

- **Grouper…** est proposé sur une ligne de corps ou d'assemblage quand la sélection (une ou plusieurs lignes d'un même assemblage) peut être groupée. **Dégrouper** n'est proposé que sur la première ligne sélectionnée.
- **Renommer** n'est proposé que pour une ligne renommable (Pantin, assemblage, corps).
- Sur une liaison fixe, les entrées **Ajouter un actionneur…**, **Ajouter un capteur…** et **Ajouter les fins de course** ne sont pas proposées. **Ajouter les fins de course** n'est pas non plus proposée sur une liaison sans limites (pivot continu).
- **Afficher dans E/S** n'est proposée que pour un élément qui peut posséder des tags.
- Une entrée absente n'est pas grisée : elle n'apparaît pas.

Le menu se ferme avec <kbd>Échap</kbd> ou par un clic ailleurs.

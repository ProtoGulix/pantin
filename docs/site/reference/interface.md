# L'écran

Les zones de la fenêtre, de haut en bas et de gauche à droite. Les noms en **gras** sont ceux de l'interface.

![Le viewer avec l'exemple plc-cylinder ouvert : arborescence à gauche, vue 3D et schéma au centre, inspecteur à droite](/screenshots/fr/overview.webp)

```
+----------------------------------------------------------------------+
| Fichier   Édition   Affichage                         (barre de menus)|
+--------------------+-------------------------------------+-----------+
| Barre d'outils     | Barre de transport                  |           |
|--------------------|-------------------------------------|           |
| Arborescence       |                                     |           |
|  (Pantin,          |  Zone du haut : une vue             | Inspecteur|
|   assemblages,     |  (3D, Schéma, Liaisons ou E/S)      |           |
|   corps, liaisons, |- - - - - - - - - - - - - - - - - - -|           |
|   éléments)        |  Zone du bas (facultative)          |           |
|                    |-------------------------------------|           |
|--------------------| Console + barre compteur            |           |
| Pont automate      |                                     |           |
+--------------------+-------------------------------------+-----------+
```

Les séparateurs entre la colonne de gauche, la zone centrale et l'inspecteur se déplacent à la souris ou au clavier (voir [Raccourcis](/reference/shortcuts)). Le détail de chaque panneau est dans [Panneaux et boutons](/reference/panels), celui de chaque vue dans [Vues centrales](/reference/views).

## La barre de menus

Elle occupe le haut de la fenêtre et contient quatre menus : **Fichier**, **Édition**, **Affichage** et **Aide**. Un menu s'ouvre au clic et se parcourt aux flèches. Les raccourcis courants y sont affichés. Voir [Menus](/reference/menus).

## La barre d'outils

Elle est en haut de la colonne de gauche, quand un Pantin est ouvert. Elle réunit les boutons d'accès rapide : retour à l'accueil (**Fermer le Pantin**), **Enregistrer**, import d'un fichier 3D et cadrage. Un indicateur signale un traitement en cours. Voir [Panneaux et boutons](/reference/panels).

## Le panneau latéral gauche

Il n'existe que lorsqu'un Pantin est ouvert. De haut en bas : la barre d'outils, le formulaire d'import, l'**arborescence des Pantins**, la carte **Pont automate**, puis la question de confirmation et la ligne de message quand il y en a. Les autres formulaires (liaison, actionneur, capteur...) s'ouvrent dans l'inspecteur.

- L'arborescence liste le Pantin, ses assemblages, ses corps, ses liaisons et les éléments de la chaîne d'action. Un clic droit ouvre le menu de l'élément (voir [Menus](/reference/menus#menu-contextuel-de-l-arborescence)).
- La carte **Pont automate** montre l'état du pont Modbus et de ses modules. Voir [Connecter un automate](/guide/connect-a-plc).

## La vue centrale

Elle a une zone du haut et, si vous l'ouvrez, une zone du bas. Chaque zone affiche une vue à la fois, parmi **3D**, **Schéma**, **Liaisons** et **E/S**, choisie avec le sélecteur placé en haut à gauche de la zone. Une vue ne s'affiche que dans une zone à la fois. Par défaut, la vue 3D est en haut et le schéma en bas. Le menu **Affichage** propose les mêmes choix, et <kbd>F4</kbd> passe la zone du haut à la vue suivante. Sans Pantin ouvert, la vue 3D occupe toute la zone. Voir [Vues centrales](/reference/views).

Dans la vue 3D, un cube des vues permet de choisir une vue standard d'un clic.

## L'inspecteur

Colonne de droite, il s'affiche et se masque avec **Affichage** puis **Inspecteur**. Il montre les propriétés de l'élément sélectionné, ses tags, les boutons de forçage et les outils de placement. Voir [Panneaux et boutons](/reference/panels).

## La barre de transport

![La barre de transport : Pause, 1 pas, 10 pas, Remise à zéro, temps simulé et nombre de pas](/screenshots/fr/transport-bar.webp)

En haut de la zone centrale, elle pilote le temps de la simulation : pause et reprise, avance de 1 ou 10 pas, remise à zéro, temps simulé, et un bouton qui relâche tous les tags forcés (visible seulement tant qu'un tag est forcé). Un avertissement apparaît si la simulation prend du retard sur le temps réel. Voir [Panneaux et boutons](/reference/panels).

## La console

Sous la vue centrale, elle s'affiche et se masque avec **Affichage** puis **Console**, ou avec <kbd>F8</kbd>. Elle liste les messages du Pantin, avec des filtres par niveau et un bouton d'effacement. Son bord supérieur est un séparateur : tirez-le pour changer sa hauteur. Le compteur d'erreurs et d'avertissements est dans une fine barre sous la zone centrale, jamais dans la barre d'outils. Voir [Panneaux et boutons](/reference/panels).

## La ligne de question et la ligne de message

Dans le panneau de gauche, une question de confirmation (fermer avec des modifications non enregistrées, supprimer un corps ou une liaison) s'affiche sous la carte **Pont automate**. Elle prend le clavier : <kbd>Entrée</kbd> choisit le bouton principal, <kbd>Échap</kbd> annule. La ligne de message juste dessous affiche les erreurs et les confirmations.

## La fenêtre d'accueil

![La fenêtre d'accueil, onglet Accueil](/screenshots/fr/welcome.webp)

Tant qu'aucun Pantin n'est ouvert, une fenêtre modale **Bienvenue — Pantin** s'affiche au centre de la vue 3D. Elle a deux onglets :

- **Accueil** : créer un Pantin (**Pantin vide** ou **Depuis un fichier 3D**), la liste des **Récents**, les **Ressources** et les **Raccourcis clavier** du menu ;
- **Tous les Pantins** : la liste complète, avec un champ de filtre par nom ou identifiant, et un bouton d'ouverture par ligne.

Son pied de page indique la version du viewer (**Pantin** suivi du numéro). Elle se ferme par son bouton ou par <kbd>Échap</kbd>. **Fichier** puis **Accueil** la rouvre, sur le dernier onglet utilisé (**Accueil** par défaut). **Fichier** puis **Ouvrir…** ferme le Pantin ouvert s'il y en a un, et la fenêtre s'ouvre alors sur le dernier onglet utilisé ; sans Pantin ouvert, elle s'ouvre sur **Tous les Pantins**. Voir [Panneaux et boutons](/reference/panels).

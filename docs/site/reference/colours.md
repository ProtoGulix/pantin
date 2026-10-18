# Lire les couleurs et les repères

Chaque codage de l'écran se lit sans la couleur : un pictogramme, une forme, un plein ou un contour, un style de trait ou un mot dit la même chose qu'elle. Les couleurs ont en plus été choisies pour les utilisateurs daltoniens : les paires de codages montrés ensemble sont enregistrées et vérifiées par des tests, avec une simulation de la protanopie, de la deutéranopie et de la tritanopie. Là où deux couleurs ne peuvent pas rester assez distantes (les axes en thème clair, les fils du schéma, le signal actif ou non, les volumes des convoyeurs, avec des écarts mesurés de 8 à 34), le test enregistre l'écart mesuré et le repère qui prend le relais.

Pantin suit les principes de la norme ISA-101 pour les écrans de conduite (gris par défaut, couleur réservée à ce qui compte, jamais seule), sans prétendre s'y conformer : le texte de la norme n'a pas été lu ([ADR 0057](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0057-colour-blind-safe-coding.md), [rapport 0010](https://github.com/ProtoGulix/pantin/blob/develop/docs/spikes/0010-isa-101-hmi-colour.md)). L'identité visuelle (orange de la marque, deux thèmes) ne change pas. Cette page décrit ce que fait le code ; les teintes exactes se règlent dans les thèmes.

## Une couleur, un sens

| Couleur | Sens, partout (3D, arborescence, schéma, panneaux) |
| --- | --- |
| Bleu de sélection | Sélectionné, focus, le côté qui bouge, attention de l'interface (modifications non enregistrées, occupé, cible d'un lien). |
| Vert | Un signal actif, une sortie alimentée, un pont en marche, et rien d'autre. |
| Ambre | Forcé, avertissement. |
| Rouge | Erreur, échec, défaut injecté, valeur invalide. |
| Orange de la marque | Pantin lui-même : boutons principaux, onglet ou mode de vue actif. Jamais un état. |
| Gris et couleurs du texte | Toute autre propriété (piloté, surveillé, terminé, information). |

Une exception assumée : l'axe Y est vert, comme dans la plupart des logiciels de CAO. La lettre **Y** au bout de l'axe le distingue du vert « actif ».

## Les états : un pictogramme à côté de la couleur

| Repère (sans couleur) | Couleur | État |
| --- | --- | --- |
| Coche | vert | Normal, correct, en marche |
| Triangle d'avertissement | ambre | Avertissement |
| Croix dans un octogone | rouge | Erreur, échec |
| Anneau | neutre | Au repos, éteint |
| Anneau dont la moitié gauche est pleine | bleu de sélection | Occupé, en cours |
| Lettre **F** près d'un connecteur du schéma ; cadenas et mot **forcé** dans l'inspecteur | ambre | Tag forcé depuis le viewer |

Ces pictogrammes (12 px) se trouvent sur la pastille du pont, les lignes des modules, la liste des modules d'E/S (qui écrit aussi le mot de l'état) et les badges du journal.

### Les badges du journal

| Repère | Remplissage et contour | Niveau |
| --- | --- | --- |
| Cercle avec un i et mot **Info** | sans remplissage, texte atténué | Information |
| Triangle et mot **Avert.** | ambre, texte sombre | Avertissement |
| Croix dans un octogone et mot **Erreur** | rouge, texte blanc | Erreur |

Chaque badge rempli a un contour qui reste visible sur le fond du panneau.

## Dans la vue 3D

| Élément | Repère (sans couleur) | Couleur |
| --- | --- | --- |
| Corps sélectionné | Un contour | Teinte bleue |
| Aperçu d'une liaison, parent | Teinte sans contour | Jaune-orangé |
| Aperçu d'une liaison, enfant (le corps qui bouge) | Teinte avec contour | Bleu |
| Pastilles du formulaire de liaison | Disque pour le parent, carré cerné pour l'enfant | Comme ci-dessus |
| Flèche d'une liaison | Une collerette (disque) à la base de la tige quand un actionneur déplace la liaison | Bleue, libre ou pilotée |
| Alignement de faces | Face qui bouge cernée d'un contour, face cible sans contour | Bleu, jaune-orangé |
| Marqueur de capteur, faisceau lumineux | Actif : épais et opaque. Inactif : fin et translucide | Actif vert, inactif neutre |
| Axes X, Y, Z | Les lettres **X**, **Y**, **Z** au bout des axes du sol, du trièdre et du cube de vues | Rouge, vert, bleu, de luminosités différentes |

Dans l'arborescence, un capteur actif est un disque plein, inactif un anneau.

## Dans le schéma des chaînes

Chaque sorte de fil a son trait et une étiquette écrite sur le fil :

| Étiquette | Sorte | Trait | Couleur |
| --- | --- | --- | --- |
| **PNEU** | Pneumatique | Tirets longs, 1,5 px | Bleu clair (thème sombre), bleu moyen saturé (thème clair) |
| **CA** | Puissance alternative | Plein, 2,5 px | Presque blanc (thème sombre) ou presque noir (thème clair) |
| **SERVO** | Asservissement | Pointillés, 2 px | Mauve (thème sombre), prune très foncé (thème clair) |
| **MÉC** | Mécanique | Plein, 1,5 px | Gris clair (thème sombre), gris foncé (thème clair) |
| **OBS** | Observation | Tiret et point, 1 px | Bleu-violet moyen (thème sombre), indigo proche du violet (thème clair) |

Ce sont l'étiquette et le style de trait qui identifient un fil, pas sa couleur. Aucun fil n'a l'ambre, le rouge ou le vert des états, ni l'orange de Pantin. Le pneumatique et l'observation, tous deux bleutés, ne se distinguent que par le trait, l'épaisseur et l'étiquette.

## Les volumes des convoyeurs

| Volume | Repère (sans couleur) | Couleur |
| --- | --- | --- |
| Émetteur | Signe **+** sur le volume, volume cerné et translucide | Presque blanc (thème sombre), presque noir (thème clair) : le gris le plus éloigné du fond |
| Absorbeur | Signe **−** sur le volume, volume cerné et translucide | Gris moyen, le plus proche du fond que la règle des 3:1 permet |
| Guide | Corps presque plein | Gris clair bleuté (thème sombre), presque noir (thème clair) |
| Bande | Corps plein | Gris foncé (thème sombre), presque noir (thème clair) |

Les signes **+** et **−** sont dessinés avec un halo, lisible sur n'importe quel gris.

## Ce qui n'est pas vérifié

- La visibilité du contour de sélection sur tous les maillages importés.
- Le rendu des couleurs sur un écran réel : les mesures sont faites par calcul, sur des simulations de daltonisme (Machado 2009), pas avec des personnes.

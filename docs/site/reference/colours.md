# Lire les couleurs et les repères

Chaque code de couleur a aussi un pictogramme, une forme, un contour, un style de trait ou un mot : la couleur n'est jamais seule. Les couleurs sont choisies pour rester lisibles par les utilisateurs daltoniens ; là où deux couleurs restent proches (axes en thème clair, fils du schéma, volumes des convoyeurs), c'est la forme, le trait ou l'étiquette qui tranche. L'écran est gris par défaut, la couleur est réservée à ce qui compte, dans l'esprit de la norme ISA-101 pour les écrans de conduite.

## Une couleur, un sens

| Couleur | Sens, partout (3D, arborescence, schéma, panneaux) |
| --- | --- |
| Bleu de sélection | Sélectionné, focus, le côté qui bouge, attention de l'interface (modifications non enregistrées, occupé, cible d'un lien). |
| Vert | Un signal actif, une sortie alimentée, un pont en marche, et rien d'autre. |
| Ambre | Forcé, avertissement. |
| Rouge | Erreur, échec, défaut injecté, valeur invalide. |
| Orange de la marque | Pantin lui-même : boutons principaux, onglet ou mode de vue actif. Jamais un état. |
| Gris et couleurs du texte | Toute autre propriété (piloté, surveillé, terminé, information). |

L'axe Y est vert, comme dans la plupart des logiciels de CAO. La lettre **Y** au bout de l'axe le distingue du vert « actif ».

## Les états : un pictogramme à côté de la couleur

| Repère (sans couleur) | Couleur | État |
| --- | --- | --- |
| Coche | vert | Normal, correct, en marche |
| Triangle d'avertissement | ambre | Avertissement |
| Croix dans un octogone | rouge | Erreur, échec |
| Anneau | neutre | Au repos, éteint |
| Anneau dont la moitié gauche est pleine | bleu de sélection | Occupé, en cours |
| Lettre **F** près d'un connecteur du schéma ; cadenas et mot **forcé** dans l'inspecteur | ambre | Tag forcé depuis le viewer |

Ces pictogrammes se trouvent sur la pastille du pont, les lignes des modules, la liste des modules d'E/S (qui écrit aussi le mot de l'état) et les badges du journal.

### Les badges du journal

| Repère | Remplissage et contour | Niveau |
| --- | --- | --- |
| Cercle avec un i et mot **Info** | sans remplissage, texte atténué | Information |
| Triangle et mot **Avert.** | ambre, texte sombre | Avertissement |
| Croix dans un octogone et mot **Erreur** | rouge, texte blanc | Erreur |

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

L'étiquette et le style de trait identifient un fil, pas sa couleur. Le pneumatique et l'observation, tous deux bleutés, se distinguent par le trait, l'épaisseur et l'étiquette.

## Les volumes des convoyeurs

| Volume | Repère (sans couleur) | Couleur |
| --- | --- | --- |
| Émetteur | Signe **+** sur le volume, volume cerné et translucide | Presque blanc (thème sombre), presque noir (thème clair) |
| Absorbeur | Signe **−** sur le volume, volume cerné et translucide | Gris moyen |
| Guide | Corps presque plein | Gris clair bleuté (thème sombre), presque noir (thème clair) |
| Bande | Corps plein | Gris foncé (thème sombre), presque noir (thème clair) |

::: warning Limites connues
Le contour de sélection n'a pas été essayé sur tous les maillages importés.
:::

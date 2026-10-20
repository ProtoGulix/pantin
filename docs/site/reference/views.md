# Vues centrales

La zone centrale du viewer montre la machine sous quatre formes : la **vue 3D**, le **schéma des chaînes**, la vue **Liaisons** et la **vue E/S**. Elle a une zone du haut et, si vous l'ouvrez, une zone du bas ; chaque zone a son sélecteur. Les touches et la souris sont dans [Raccourcis clavier et souris](/reference/shortcuts) ; les menus dans [Menus](/reference/menus) ; les autres panneaux dans [Panneaux et boutons](/reference/panels).

## Les zones et leurs sélecteurs

![La zone centrale : la vue 3D en haut, la vue Liaisons en bas, un sélecteur de vue en haut à gauche de chaque zone](/screenshots/fr/zones.webp)

La zone centrale a deux zones, l'une au-dessus de l'autre. Au départ, la **zone du haut** montre la vue **3D** et la **zone du bas** le **Schéma**. Chaque zone a son **sélecteur de vue**, en haut à gauche : quatre boutons à bascule **3D**, **Schéma**, **Liaisons** et **E/S**. Le bouton de la vue affichée est enfoncé, souligné d'un trait et teinté.

| Contrôle | Ce qu'il fait |
| --- | --- |
| Sélecteur **Vue de la zone du haut** | Choisit la vue de la zone du haut. |
| Sélecteur **Vue de la zone du bas** | Choisit la vue de la zone du bas. |
| **Ouvrir la zone du bas** (bouton **+**, à droite du sélecteur du haut) | Ouvre la zone du bas, sur la première vue que la zone du haut n'affiche pas. Absent quand la zone du bas est ouverte. |
| **Fermer la zone du bas** (bouton **✕**, à droite du sélecteur du bas) | Ferme la zone du bas : la zone du haut occupe toute la zone centrale. |

Une vue ne s'affiche que dans **une seule zone** à la fois. Dans le sélecteur de l'autre zone, son bouton est grisé et **barré**, et son info-bulle dit pourquoi (par exemple **3D : déjà affichée dans l'autre zone**). Pour la déplacer, choisissez d'abord une autre vue dans la zone qui l'affiche.

La touche **F4** passe la zone du haut à la vue suivante, dans l'ordre **3D**, **Schéma**, **Liaisons**, **E/S**, puis de nouveau **3D**. Elle saute la vue que la zone du bas affiche. Le menu **Affichage** propose les mêmes choix : **Zone du haut : 3D**, **Zone du bas : Schéma**, **Ouvrir la zone du bas**, **Fermer la zone du bas** (voir [Menus](/reference/menus)).

Quand la zone du bas est ouverte, une poignée horizontale sépare les deux zones (**Redimensionner les deux zones**). Glissez-la pour changer le partage ; un double-clic le rétablit. Le partage est gardé dans le navigateur. Le choix des vues l'est aussi : un réglage enregistré par une version précédente est repris tel quel.

Changer de vue conserve la caméra 3D, le défilement du schéma et les champs en cours de saisie. La vue 3D ne se dessine que tant qu'elle est affichée dans une des deux zones.

Sans Pantin ouvert, seule la vue 3D vide est affichée, sous la [fenêtre d'accueil](/reference/panels#la-fenetre-d-accueil).

## La vue 3D

La vue 3D dessine la machine à partir des positions que le cœur envoie en continu.

Sous la vue, une ligne d'aide rappelle les gestes de souris selon le préréglage de navigation choisi (**Souris : SolidWorks** ou **Souris : ZW3D**).

### Naviguer

| Geste | Effet |
| --- | --- |
| Rotation, déplacement, zoom à la souris | Dépendent du préréglage choisi dans **Affichage** : **Souris : SolidWorks** ou **Souris : ZW3D**. Le bouton gauche n'a pas d'action de caméra : il sélectionne. |
| Molette | Zoome. L'entrée **Inverser le sens de la molette** du menu **Affichage** change le sens. |
| Flèches du clavier | Tournent la caméra par pas. La taille du pas est réglée par l'entrée **Pas des flèches** du menu **Affichage**. Le focus doit être sur la vue (cliquez dedans). |
| **Perspective** (menu **Affichage**) | Case à cocher : active ou désactive la perspective de la caméra. |

Les différences exactes entre les deux préréglages (quel bouton fait quoi, avec quelles touches) sont dans [Raccourcis](/reference/shortcuts).

### Le cube des vues

![Le cube des vues, en haut à droite de la vue 3D](/screenshots/fr/view-cube.webp)

Le cube tourne avec la caméra et permet de regarder la machine depuis une direction précise, d'un clic.

| Élément du cube | Effet du clic |
| --- | --- |
| Une face (nommée **Face**, **Arrière**, **Gauche**, **Droite**, **Dessus**, **Dessous**) | La caméra tourne vers cette vue standard. |
| Une arête ou un coin | La caméra tourne vers cette direction oblique. |
| Le survol | Allume toutes les cellules du cube qui demandent la même vue. |

Après un clic, le focus revient à la vue : les flèches continuent à tourner la caméra.

### Les vues standard

Sept vues standard existent : **Face**, **Arrière**, **Gauche**, **Droite**, **Dessus**, **Dessous**, **Isométrique**. Il y a trois façons de les choisir :

- cliquer une face du cube des vues ;
- appuyer sur **Espace** (le focus sur la vue ou la page, pas sur un bouton, l'arborescence ou le schéma) : une liste des vues apparaît à la position du pointeur, avec les flèches haut et bas et **Échap** pour fermer ;
- les touches de raccourci, indiquées dans [Raccourcis](/reference/shortcuts), ou le menu **Affichage**.

Les raccourcis <kbd>Ctrl</kbd>+<kbd>1</kbd> à <kbd>Ctrl</kbd>+<kbd>7</kbd> utilisent la touche physique du chiffre (rangée du haut ou pavé numérique) : ils marchent aussi sur un clavier AZERTY.

### Regarder une face de face

**Affichage**, **Vue normale à une face** (<kbd>Ctrl</kbd>+<kbd>8</kbd>) tourne la caméra pour regarder une face à angle droit. Après la commande, la ligne de message dit : **Cliquez sur une face dans la vue 3D pour la regarder de face. Échap annule.** Cliquez une face d'un corps : la caméra se place devant elle. <kbd>Échap</kbd>, ou la même commande une seconde fois, annule l'attente. Pendant l'attente, l'entrée de menu est cochée.

### Revenir à la vue précédente

**Affichage**, **Vue précédente** (<kbd>Ctrl</kbd>+<kbd>Maj</kbd>+<kbd>Z</kbd>) remet la vue d'avant de la caméra : angles, cible et zoom. Les 50 dernières vues sont gardées. Dans un champ de saisie, <kbd>Ctrl</kbd>+<kbd>Maj</kbd>+<kbd>Z</kbd> reste le rétablissement du champ.

### Cadrer

**Tout cadrer** (menu **Affichage**, bouton **Cadrer tout**) place la caméra pour voir tous les corps. **Cadrer la sélection** (bouton, menu, ou **Cadrer la vue sur l'élément** dans le menu contextuel de l'arborescence) la place sur l'élément sélectionné. Les deux sont grisés sans corps, et en disposition sans vue 3D.

### Sélectionner

La sélection est partagée entre la vue 3D, l'arborescence et le schéma : ce que vous sélectionnez dans l'un est surligné dans les autres et décrit dans l'inspecteur.

| Geste dans la vue 3D | Effet |
| --- | --- |
| Clic sur un corps | Sélectionne l'assemblage de plus haut niveau qui le contient. |
| Nouveau clic sur le même corps (double-clic) | Descend d'un niveau dans les sous-assemblages, jusqu'au corps lui-même. |
| Clic sur une bande, un guide, un émetteur, un absorbeur ou une cellule de présence | Sélectionne l'objet, à condition qu'aucun corps ne soit devant. |
| Clic dans le vide | Désélectionne. Pendant qu'un outil de placement est actif, ce clic est ignoré pour ne pas perdre l'assemblage sur lequel l'outil travaille. |
| Glisser avec un bouton de caméra | Fait tourner ou déplace la caméra, et ne sélectionne jamais. |

Un corps ou un assemblage sélectionné prend une teinte bleue et un contour. Pour une liaison sélectionnée, le parent est jaune-orangé et l'enfant (le corps qui bouge) bleu et cerné, comme les pastilles du [formulaire de liaison](/reference/panels#nouvelle-liaison). Une flèche montre l'axe et le sens positif de la liaison. Toutes les couleurs et tous les repères sont dans [Lire les couleurs et les repères](/reference/colours).

### Les capteurs dans la vue

Chaque capteur de liaison est dessiné dans la vue : un tronçon épais de l'axe pour un capteur de plage, un arc pour un pivot, un anneau sinon. Il s'allume (vert, plus épais et opaque) quand son tag d'état est à 1 et reste neutre, fin et translucide à 0 ; voir [Lire les couleurs et les repères](/reference/colours).

### Masquer et isoler

Dans le menu contextuel d'un assemblage, ou avec l'oeil de l'arborescence :

| Action | Effet |
| --- | --- |
| **Masquer dans la vue 3D** / **Afficher dans la vue 3D** | Cache ou montre l'assemblage et ses sous-assemblages. |
| **Isoler dans la vue 3D** | Ne garde visible que cet assemblage (et ses sous-assemblages). |
| **Afficher tous les assemblages** | Défait l'isolement. |

Cet affichage n'est jamais enregistré dans le Pantin : il revient à zéro à la prochaine ouverture. La simulation n'est pas touchée : un assemblage masqué continue de bouger et de détecter.

### Le manipulateur de placement

Le manipulateur est une poignée à trois axes que vous glissez pour placer un assemblage. Il n'existe que si un seul assemblage est sélectionné, que la vue 3D est affichée et que l'inspecteur est ouvert. Si une de ces conditions disparaît, l'outil s'éteint.

| Contrôle (barre de l'inspecteur ou menu **Édition**) | Effet |
| --- | --- |
| **Déplacer (G)** | Poignées de translation. |
| **Tourner (R)** | Poignées de rotation. |
| **Repère local de l'assemblage (L)** / **Repère du support (L)** | Choisit les axes du manipulateur : ceux de l'assemblage ou ceux de son support. |
| Champ de pas | Aimantation du glissement, en mm ou en degrés. **Ctrl** maintenu pendant le glissement : sans pas. |
| **Échap** pendant un glissement | Rétablit le placement du début du glissement. |
| **Rétablir le placement précédent** | Renvoie le placement gardé avant la dernière modification. |

Pendant que vous glissez, les champs **X**, **Y**, **Z**, **RX**, **RY**, **RZ** de l'inspecteur montrent la valeur en cours. Les corps se déplacent à l'écran quand le cœur a accepté le placement : le manipulateur seul bouge pendant le glissement.

### L'alignement par faces

**Aligner (A)** place un assemblage par rapport à un autre en pointant des faces. Le bloc **Aligner « nom »** de l'inspecteur liste les pointages à faire ; chaque pointage est un clic sur une face de la vue 3D. Les faces pointées sont teintées.

| Type | Pointages demandés |
| --- | --- |
| **Plan sur plan** | Une face plane de la pièce qui bouge, une face plane de la cible |
| **Axe sur axe** | Un trou ou un arbre de chaque pièce |
| **Axe sur axe autour d'un pivot** | Un pivot sur la cible (un trou déjà aligné), un autre trou de la pièce qui bouge, un trou de la cible en face |

La pièce qui bouge est l'assemblage sélectionné. Les faces de la cible doivent appartenir à une pièce qui reste en place. Pendant l'alignement, un clic dans la vue 3D est un pointage, pas une sélection. Les contrôles du bloc sont décrits dans [Panneaux et boutons](/reference/panels#la-section-positionnement-et-l-alignement).

::: info Corps sans fichier de faces
Si un corps n'a pas de fichier de faces, l'alignement ne peut viser que le plan d'un triangle, jamais un axe (la console le signale).
:::

### Déplacer une liaison à la main

Le curseur **Position de « nom »** de l'inspecteur, pour une liaison mobile, déplace la liaison pendant que vous le tenez. Les corps bougent dans la vue 3D comme si un actionneur les poussait ; la valeur est en mm ou en degrés. C'est un geste d'édition, utile pour vérifier les limites et l'axe.

## Le schéma des chaînes

![Le schéma des chaînes : distributeur, vérin, liaison et capteurs](/screenshots/fr/diagram.webp)

Le schéma dessine la chaîne d'action de la machine : ce que l'automate commande, ce que cela déplace, ce qui le surveille. Il lit les mêmes tags que l'inspecteur et s'allume en temps réel.

### La structure

Le schéma est découpé en **bandes**, une par assemblage. Chaque bande est repliable. Les éléments y sont rangés en quatre **colonnes**, de gauche à droite :

| Colonne | Contenu |
| --- | --- |
| **Préactionneurs** | Distributeurs, contacteurs, variateurs. |
| **Actionneurs** | Vérins, moteurs. |
| **Liaisons** | Les liaisons mobiles déplacées ou surveillées. Les liaisons fixes ne sont pas dessinées. |
| **Capteurs** | Capteurs de liaison. |

L'en-tête des colonnes reste en haut quand le schéma défile. Un élément placé dans une autre bande que celle de son assemblage porte un badge au nom de cet **Assemblage**.

| Contrôle | Effet |
| --- | --- |
| Bouton de bande (chevron et nom) | Replie la bande à son seul en-tête (**Replier l'assemblage nom**) ou la déplie (**Déplier l'assemblage nom**). Une bande repliée n'a ni nœud ni lien. |
| **+** en tête de colonne **Préactionneurs**, **Actionneurs**, **Capteurs** | Ouvre le formulaire de création correspondant dans l'inspecteur (**Nouveau préactionneur**, **Nouvel actionneur**, **Nouveau capteur**). |
| En-tête de colonne **Liaisons** | Pas de **+** : une liaison relie deux corps, elle se crée depuis l'arborescence (**Nouvelle liaison…**). L'info-bulle le dit. |

Quand le Pantin n'a encore aucun élément, le schéma dit : **Aucune chaîne à montrer pour l'instant. Ajoutez un préactionneur, un actionneur ou un capteur avec les boutons + ci-dessus.**

### Les noeuds

Un noeud est une boîte avec son nom, son type et ses **connecteurs** (petits ronds avec leur nom).

| Noeud | Connecteurs |
| --- | --- |
| Préactionneur | À gauche, ses tags de commande (ce que l'automate écrit). À droite, ses orifices de sortie. |
| Actionneur | À gauche, ses orifices d'entrée. À droite, un lien vers les liaisons qu'il déplace. |
| Liaison | Un lien depuis l'actionneur, un lien vers les capteurs. |
| Capteur | Un lien vers la liaison surveillée, et ses tags de retour (valeur en lecture seule). |

Un clic sur un noeud le sélectionne : un préactionneur, un actionneur ou un capteur s'affiche dans l'inspecteur ; une liaison sélectionne sa ligne dans l'arborescence. La chaîne du noeud sélectionné reste en pleine couleur, le reste s'estompe, et les noeuds liés sont marqués. Sélectionner un élément ailleurs (arborescence, vue 3D) le met en évidence ici.

### Les liens

Un lien relie deux connecteurs. Il y en a de cinq sortes, nommées dans les info-bulles et pour les lecteurs d'écran : **Liaison pneumatique**, **Liaison de puissance alternative**, **Liaison d'asservissement** (d'un préactionneur à un actionneur), **Liaison mécanique** (d'un actionneur à une liaison) et **Liaison d'observation** (d'un capteur à une liaison). Chaque sorte a son style de trait et une étiquette écrite sur le fil : **PNEU**, **CA**, **SERVO**, **MÉC** et **OBS** (voir [Lire les couleurs et les repères](/reference/colours#dans-le-schema-des-chaines)).

Un clic sur un lien le sélectionne et fait apparaître un petit **×** à mi-chemin. Cliquer le **×** retire le lien. Pour un lien d'observation, le **×** est grisé : un capteur surveille toujours une liaison, il se **déplace** en glissant son lien sur une autre liaison.

### Relier deux éléments

Il y a deux façons de câbler, avec les mêmes règles :

**À la souris.** Appuyez sur le connecteur de départ (une sortie de préactionneur, la sortie d'un actionneur, ou le fil d'un capteur) et glissez. Pendant le glissement, une ligne suit le pointeur ; les connecteurs où le lien est permis s'allument, ceux où il serait refusé s'estompent. Relâchez sur la cible pour créer le lien. **Échap** annule le glissement. Un déplacement de moins de quatre pixels est un simple clic.

**Au clavier, avec Relier à….** Sur un connecteur de puissance, **Entrée** ouvre un petit menu **Relier à…** qui liste les cibles possibles (`nom du noeud · nom du connecteur`). **Entrée** relie, **Échap** referme et rend le focus au connecteur. Un lien existant se retire par le menu **Retirer le lien vers…**.

Si le lien est refusé, la raison s'affiche dans la ligne de message :

| Raison | Message |
| --- | --- |
| Domaine différent | **Le port … ne transporte pas ce que lit l'entrée ….** |
| Déjà fait | **Déjà relié ainsi.** |
| Alimentation incomplète | **… ne peut pas alimenter toutes les entrées de ….** |
| Liaison fixe | **La liaison … est fixe : aucun actionneur ne peut la déplacer.** |
| Liaison déjà déplacée | **La liaison … est déjà déplacée par ….** |
| Unités différentes | **La liaison … n'a pas la même unité que les liaisons de … (mètres ou degrés).** |
| Capteur sans liaison | **Un capteur surveille toujours une liaison : glissez son lien sur une autre liaison au lieu de le retirer.** |
| Sans objet | **Ces deux éléments ne peuvent pas être reliés.** |
| Modification en cours | **Une autre modification est en cours : réessayez dans un instant.** |

Remplacer l'alimentation d'un actionneur déjà alimenté par un autre préactionneur passe d'abord par la confirmation **Remplacer** / **Annuler**.

### Les valeurs vivantes

Le schéma est mis à jour quatre fois par seconde à partir des tags et de l'état des préactionneurs.

| Ce qui s'allume | Quand |
| --- | --- |
| Un connecteur de commande ou de retour | Son tag est à 1. |
| Un orifice pneumatique et ses liens | Il est sous pression (**sous pression**). Pas quand il est à l'échappement ou bloqué. |
| Un orifice de puissance alternative et ses liens | Le sens de marche n'est pas nul (**sous tension**). |
| Un orifice d'asservissement | Jamais : c'est une consigne, pas un flux. Le mouvement se voit sur la liaison, en 3D, et sur le tag de retour. |
| Liens mécaniques et d'observation | Jamais. |

Une alerte accompagne un préactionneur en diagnostic : le noeud est entouré et le nom court du diagnostic est écrit sous la boîte, par exemple **⚠ Commandes contradictoires**. L'info-bulle et le nom accessible donnent le texte complet.

### Forcer une commande depuis le schéma

![Une bobine forcée depuis le schéma, avec sa marque F](/screenshots/fr/forced-tag.webp)

Les connecteurs de commande à gauche d'un préactionneur sont des boutons. Ils écrivent le tag comme le ferait l'automate, avec les mêmes règles que l'inspecteur.

| Geste | Effet |
| --- | --- |
| Clic (ou **Espace**) sur une commande booléenne | La bascule : elle passe de 0 à 1 ou de 1 à 0. |
| Clic (ou **Entrée**) sur une commande numérique | Ouvre un petit champ à côté du connecteur, avec l'unité (mm/s, degrés...) et la valeur actuelle sélectionnée. **Entrée** envoie ; **Échap**, ou quitter le champ, ferme sans écrire. Un texte qui n'est pas un nombre garde le champ ouvert, marqué (**Saisir un nombre**). Faire défiler le schéma ferme le champ. |
| Marque **F** à côté du connecteur | Elle apparaît tant que le tag est forcé : l'automate ne peut pas l'écrire. L'info-bulle dit **Forcé : nom du tag**. |
| Touche **Menu** sur un connecteur forcé (au clavier) | Ouvre un menu d'une entrée, **Relâcher** (titre **Tag forcé**), qui rend le tag à l'automate. |

Un clic sur un connecteur de commande ne sélectionne pas le noeud : l'inspecteur ne saute pas pendant un essai.

### Au clavier

Le schéma se parcourt entièrement au clavier : les flèches passent d'un noeud à l'autre, **Entrée** entre dans les connecteurs d'un noeud, **Espace** sélectionne le noeud (ou bascule une commande booléenne), **Échap** revient en arrière, **Début** et **Fin** vont au premier ou dernier noeud, **Suppr** retire le lien d'un connecteur ou le lien sélectionné, **F2** renomme un préactionneur, un actionneur ou un capteur. Le détail est dans [Raccourcis](/reference/shortcuts). **Suppr** ne supprime jamais un élément : pour cela, utilisez le menu **Édition**. Si vous appuyez dessus sur un noeud, la ligne de message vous le rappelle.

## La vue Liaisons

![La vue Liaisons de l'exemple plc-cylinder : le Monde à gauche, le groupe Verin1 (un corps) relié au Monde, le groupe Tige (deux corps) et la glissière du vérin entre les deux, marquée de l'éclair des liaisons déplacées par un actionneur et du détecteur des liaisons surveillées par un capteur](/screenshots/fr/joint-view.webp)

La vue **Liaisons** dessine l'**arbre cinématique** de la machine : qui bouge par rapport à qui. Ce n'est pas l'arborescence de gauche. L'arborescence range les corps dans des assemblages et ne porte aucun mouvement ; la vue Liaisons ne montre que ce qui est relié par des liaisons. Les deux arbres peuvent différer, et c'est le but : vous voyez d'un coup d'œil un corps qui ne suit pas le groupe que vous attendiez, ou un corps relié par vingt liaisons fixes. Pour comprendre les groupes, voir [Le modèle d'un Pantin](/guide/model#les-concepts-corps-assemblage-groupe).

La vue ne fait que montrer : elle ne modifie rien. Pour créer, changer ou supprimer une liaison, utilisez l'arborescence, l'inspecteur et le formulaire de liaison.

### Ce que la vue montre

L'arbre se lit de gauche à droite : chaque colonne est un niveau plus loin du Monde.

| Élément | Forme | Ce qu'il veut dire |
| --- | --- | --- |
| **Monde** | Un cercle, avec des hachures de sol et le nom en dessous. | Le sol fixe, à gauche de l'arbre. Tout ce qui y est rattaché sans liaison ne bouge pas. |
| **Groupe** | Un rectangle à coins arrondis, avec son nom, un nombre et une flèche **▸**. | Un assemblage visé par une liaison : une seule pièce rigide. Le nombre est celui des corps qui le suivent, sans liaison propre. La flèche les déplie. |
| **Corps** | Une pastille (un rectangle aux extrémités rondes). | Un corps qui est l'extrémité d'une liaison, ou, une fois un groupe déplié, un corps qui suit ce groupe. |
| **Liaison** | Une courbe du parent vers l'enfant, avec un signe au milieu et son nom près de l'enfant. | Chaque liaison du Pantin, y compris les liaisons fixes. Le type se lit au style du trait et au signe. |
| **Corps qui suit son groupe** | Un trait fin en pointillés très serrés, sans signe ni nom. | Le corps n'a pas de liaison : il bouge avec son groupe. |
| **Rattachement au Monde** | Un trait fin et clair, sans signe ni nom. | L'élément n'a pas de liaison parente : il est fixé au Monde. |

Le type d'une liaison se lit à trois indices, jamais à la couleur seule : le style du trait, le signe au milieu, et le nom de la liaison.

| Type | Trait | Signe |
| --- | --- | --- |
| **Fixe** | Fin, continu. | Un carré plein (soudure). |
| **Glissière** | Épais, longs tirets. | Un rectangle avec une flèche à deux pointes. |
| **Pivot limité** | Épais, continu. | Un arc fermé par deux butées. |
| **Pivot continu** | Épais, en points ronds. | Un cercle complet avec une flèche. |
| **Hélicoïdale (vis et écrou)** | Épais, alternant tiret et point. | Trois petits traits obliques (un filet). |

Une liaison **déplacée par un actionneur** porte en plus un signe en forme d'**éclair** à côté de son signe de type. Une liaison **surveillée par un capteur** porte un signe de détecteur avec ses ondes, **dessiné en contour** là où l'éclair est plein. Si la liaison est à la fois déplacée et surveillée, les deux signes se suivent. Le nom accessible de la liaison le dit aussi : **mue par un actionneur**, **surveillée par un capteur**. La légende a une ligne pour chacun.

Les corps qui suivent leur groupe sont repliés par défaut : le groupe affiche seulement leur nombre. Cliquez la flèche **▸** du groupe (info-bulle **Afficher les N corps qui le suivent**) pour les voir, chacun au bout d'un trait en pointillés ; la flèche se retourne et son info-bulle devient **Masquer les N corps qui le suivent**. Un corps qui n'est ni l'extrémité d'une liaison ni rangé dans un groupe est compté dans le **Monde**, puisqu'il ne bouge jamais.

Un nom long est coupé par des points de suspension dans sa forme ; la forme de l'élément sélectionné s'agrandit pour montrer son nom en entier.

### Un sous-assemblage sans liaison

Dans l'arborescence, un sous-assemblage est rangé dans l'assemblage au-dessus de lui. Cela ne le fait pas bouger avec lui : seules les liaisons transmettent le mouvement. La vue Liaisons le montre : un sous-assemblage qui n'a pas de liaison parente apparaît **rattaché au Monde**, par un trait fin, même quand l'assemblage au-dessus est mobile. Cela veut dire qu'il reste immobile quand le groupe du dessus bouge. Si ce n'est pas voulu, reliez-le au groupe qu'il doit suivre (liaison fixe, glissière ou pivot).

### La ligne de légende

En bas à gauche de la vue, une ligne **Légende** (avec un chevron) est repliée. Cliquez-la (info-bulle **Afficher la légende**) pour déplier la liste de tous les traits, signes et formes décrits plus haut ; **Fermer la légende** la replie. Cet état est gardé dans le navigateur.

![La légende dépliée : un trait et un signe par type de liaison, le signe de l'actionneur, le signe du capteur, les formes du Monde, du groupe et du corps](/screenshots/fr/joint-legend.webp)

### Ce que vous pouvez faire dans la vue

| Geste | Effet |
| --- | --- |
| Clic sur un groupe ou un corps | Le sélectionne. L'arborescence, la vue 3D, le schéma et l'inspecteur suivent, comme pour toute sélection. |
| Clic sur une liaison | Sélectionne la liaison. |
| Clic droit | Ouvre le menu contextuel de l'arborescence pour ce groupe, ce corps ou cette liaison, avec les mêmes entrées (voir [Menus](/reference/menus#menu-contextuel-de-l-arborescence)). |
| Double-clic | Cadre l'élément (ou l'enfant de la liaison) dans la vue 3D quand elle est affichée. Sinon, sélectionne seulement : la disposition ne change jamais d'elle-même. |
| Molette | Zoome autour du pointeur. |
| Glisser le fond | Déplace la vue. |
| Bouton **Ajuster** (en haut à droite de la vue) | Resserre l'arbre pour qu'il tienne dans la zone, jusqu'à ce que les noms se touchent ; au-delà, faites glisser la vue. |
| Clic sur **▸**, ou <kbd>+</kbd> / <kbd>−</kbd> au clavier | Déplie ou replie les corps qui suivent un groupe. |

L'élément sélectionné ailleurs (arborescence, vue 3D, schéma) est mis en évidence ici : son contour et son chemin jusqu'au Monde sont épaissis et teintés. Pour un préactionneur ou un actionneur, ce sont les liaisons qu'il déplace. La sélection multiple reste dans l'arborescence.

Au clavier, un seul élément est un arrêt de tabulation ; les touches sont dans [Raccourcis clavier et souris](/reference/shortcuts#vue-liaisons). Zoom et déplacement ne sont pas enregistrés : ils restent quand vous changez de vue, et l'arbre est recadré quand vous ouvrez un autre Pantin.

Sans aucune liaison, la vue affiche **Aucune liaison : tous les corps sont fixes dans le Monde.**

## La vue E/S

![La vue E/S avec le module m1, ses réglages et le tableau des voies](/screenshots/fr/io-view.webp)

La vue E/S est l'éditeur de la liste d'entrées/sorties du Pantin (`io.json`) : quels tags sont donnés à l'automate, sur quel module Modbus, à quelle adresse. Elle remplace la 3D et le schéma. Ce qu'elle écrit est enregistré et annulé avec le Pantin, comme le reste.

::: info Une liste pour l'automate
Les modules ici sont ceux que le pont présente à l'automate (voir [Connecter un automate](/guide/connect-a-plc)). Le bouton **Exporter la GVL** produit la liste de variables CODESYS correspondante.
:::

### Les états de la vue

| État | Ce qui s'affiche |
| --- | --- |
| Lecture | **Lecture de la liste d'E/S…** |
| Pas de liste | **Ce Pantin n'a pas encore de liste d'E/S (io.json).** et le bouton **Créer le mapping**. |
| Illisible | **Le fichier io.json est illisible : aucune modification n'est possible ici. Corrigez le fichier ou supprimez-le.** |
| Échec de lecture | **La liste d'E/S n'a pas pu être lue.** et le bouton **Réessayer**. |
| Édition | L'éditeur complet, décrit ci-dessous. |

Si une lecture échoue alors qu'un mapping était déjà affiché, la vue ajoute **Le mapping affiché peut être périmé : la dernière lecture a échoué.** avec **Réessayer**.

**Créer le mapping** crée la liste d'E/S en ajoutant un premier module, choisi par le cœur. En ligne de commande, `pantin io init` crée le fichier et le pré-remplit.

### La barre et la liste des problèmes

| Contrôle | Effet | Grisé quand |
| --- | --- | --- |
| **Exporter la GVL** | Télécharge la GVL CODESYS du mapping affiché, modifications non enregistrées comprises. | Voir ci-dessous |
| **Exporter en CSV** | Télécharge le mapping en fichier de tableur (`<Pantin>-io.csv`), une ligne par voie : module, port, identifiant d'unité (unit id), tag, variable, zone, adresse, type, sens, commentaire. Un commentaire qui commence par `=`, `+`, `-` ou `@` (ou par une tabulation ou un retour chariot) est écrit avec une apostrophe devant, pour que le tableur l'affiche comme du texte. Lecture seule : le fichier n'est jamais relu. | Comme **Exporter la GVL** |

Les boutons restent visibles mais inactifs (info-bulle explicative) quand :

- le mapping n'est pas encore lu (**Le mapping n'est pas encore lu : la GVL n'est pas disponible.**) ;
- il n'y a pas de mapping (**Pas de mapping : créez-le d'abord pour exporter la GVL.**) ;
- le mapping a des problèmes (**Le mapping a des problèmes : corrigez-les (liste ci-dessous) pour exporter la GVL.**).

Pour **Exporter en CSV**, l'info-bulle d'un bouton inactif est la même dans les trois cas : **Le mapping n'est pas encore lu, est absent ou a des problèmes : corrigez-le (liste ci-dessous) pour exporter le CSV.**

Sous les boutons, **Problèmes (n)** liste tout ce que le cœur trouve à redire. Un problème attaché à une cellule est un bouton (info-bulle **Aller à la cellule concernée**) : il sélectionne le module, défile jusqu'à la cellule et lui donne le focus. Un problème qui concerne le fichier entier est un simple texte, préfixé **Fichier entier :**. La liste disparaît quand il n'y en a plus.

### Les modules

La colonne de gauche, **Modules**, liste les modules. Chaque ligne est un bouton à bascule (le module choisi est enfoncé) qui montre :

- une pastille de connexion (pictogramme) et son texte, écrit sur la ligne du module : **pont arrêté**, **en attente de l'automate** ou **automate connecté** ;
- la clé du module et son port (`m1`, `:1502`) ;
- le nombre de voies (**n voies**) et, s'il y en a, de problèmes (**n problèmes**).

| Contrôle | Effet | Grisé quand |
| --- | --- | --- |
| Ligne de module | Sélectionne le module : ses réglages et ses voies s'affichent au centre. | Jamais |
| **Ajouter un module** | Ajoute un module à la liste. Le cœur choisit sa clé et son port ; vous pouvez les changer ensuite. | Une requête est en cours |

Sans module : **Aucun module.**

### Les réglages du module

Au centre, en haut, sous **Réglages du module** pour le module sélectionné. Chaque champ est envoyé tel qu'il est tapé quand on le quitte ; c'est le cœur qui vérifie les plages et les doublons. Un champ en erreur est marqué et son info-bulle donne la raison.

| Champ | Rôle |
| --- | --- |
| **Clé** | Nom du module. Unique. |
| **Port** | Port Modbus TCP du module. |
| **Adresse d'unité** | Identifiant de l'unité Modbus. |
| **Ordre des mots** | **Mot faible en premier** ou **Mot fort en premier**, pour les valeurs sur 32 bits. |
| **Chien de garde (ms)** | Délai de surveillance du module (par défaut 1000 ms, voir [Connecter un automate](/guide/connect-a-plc)). |
| **Supprimer le module clé** | Supprime le module et ses voies. Grisé pendant une requête. |

Les plages autorisées et leurs valeurs par défaut sont dans [Connecter un automate](/guide/connect-a-plc). Modifier les E/S pendant que le pont tourne l'arrête.

### Le tableau des voies

Sous les réglages, **Voies** liste les tags affectés à ce module, un par ligne. Sans voie : **Aucune voie dans ce module.**

| Colonne | Contenu | Modifiable |
| --- | --- | --- |
| **Tag** | Le tag du viewer (`assemblage.élément.membre`). Un clic sélectionne l'élément qui le possède (info-bulle **Sélectionner l'élément propriétaire de nom**). Un tag que le Pantin ne connaît plus reste en texte simple. | Non |
| **Variable** | Nom de la variable CODESYS. | Oui |
| **Zone** | Zone Modbus, affichée telle que le cœur la donne : `coil`, `discrete_input`, `holding_register` ou `input_register` (non traduite). Calculée par le cœur. | Non |
| **Adresse** | Adresse dans la zone. | Oui |
| **Type** | Type de la voie, calculé par le cœur : `BOOL`, `REAL` ou `DINT`. | Non |
| **Commentaire** | Texte libre repris dans la GVL. | Oui |
| **Actions** | **Réaffecter** et **Retirer** (voir ci-dessous). | Sans objet |

| Bouton | Effet |
| --- | --- |
| **Réaffecter** | Recalcule la zone et le type du tag auprès du cœur (**Réaffecter nom : zone et type sont recalculés par le coeur**). Grisé pendant une requête. |
| **Retirer** | Retire la voie du module ; le tag redevient non affecté (**Retirer la voie nom**). Grisé pendant une requête. |

Une cellule qui a un problème est marquée, et son info-bulle donne le message.

### Les tags non affectés

La colonne de droite, **Tags non affectés (n)**, liste les tags du Pantin que personne n'a encore donnés à l'automate, groupés par assemblage. Sans tag à affecter : **Tous les tags sont affectés.**

| Contrôle | Effet | Grisé quand |
| --- | --- | --- |
| Nom du tag | Sélectionne l'élément propriétaire. | Jamais |
| **Affecter à module** | Ajoute ce tag au module sélectionné (ou, à défaut, au premier module). | Une requête est en cours, ou il n'y a aucun module (**Ajoutez un module pour affecter des tags.**) |
| **Affecter tout** | Ajoute en une seule requête tous les tags non affectés au module sélectionné. | Mêmes raisons |

Le cœur choisit la zone, le type et l'adresse : vous ne les tapez pas à l'affectation. Vous pouvez ensuite changer l'adresse, le nom de variable et le commentaire dans le tableau.

Ces boutons restent visibles quand ils sont inactifs et gardent leur info-bulle : les cliquer ne fait rien, mais le focus clavier n'est pas perdu.

La table des zones et des codes fonction est dans [Connecter un automate](/guide/connect-a-plc).

::: warning Limites connues
Le sens de molette du préréglage **Souris : ZW3D** est celui de Babylon.js (pousser la molette vers l'avant zoome) ; il n'a pas été comparé au logiciel d'origine. Le préréglage **Souris : SolidWorks** zoome en arrière en poussant vers l'avant.

La vue **Liaisons** n'a été éprouvée que sur de petits Pantins et sur des Pantins de test : sur un grand Pantin réel (plusieurs dizaines de groupes), la lisibilité des signes et des noms n'est pas vérifiée. Elle montre la structure, pas l'état : la position d'une liaison et un défaut « grippé » n'y apparaissent pas, et on ne peut pas y modifier une liaison.
:::

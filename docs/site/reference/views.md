# Vues centrales

La zone centrale du viewer montre la machine sous trois formes : la **vue 3D**, le **schéma des chaînes** et la **vue E/S**. Elles se combinent en quatre dispositions. Cette page décrit chaque vue, bouton par bouton et geste par geste. Les touches et combinaisons de souris sont dans [Raccourcis clavier et souris](/reference/shortcuts) ; les menus dans [Menus](/reference/menus) ; les autres panneaux dans [Panneaux et boutons](/reference/panels).

## Les quatre dispositions

| Disposition | Ce qu'elle montre | Comment l'obtenir |
| --- | --- | --- |
| **3D seule** | La vue 3D occupe toute la zone. | Bouton **3D** de la barre d'outils, menu **Affichage** |
| **Schéma des chaînes seul** | Le schéma occupe toute la zone. | Bouton **Schéma**, menu **Affichage** |
| **3D + Schéma** | La vue 3D en haut, le schéma en dessous. C'est la disposition par défaut. | Bouton **3D + Schéma**, menu **Affichage** |
| **E/S seules** | La liste d'E/S (modules, voies, tags non affectés). | Menu **Affichage**, bouton **Config E/S** de la carte **Pont automate**, ou **Afficher dans E/S** |

La touche **F4** fait tourner entre **3D + Schéma**, **3D seule** et **Schéma des chaînes seul**. Elle ne passe jamais par **E/S seules** : depuis cette vue, elle revient à **3D + Schéma**.

Dans la disposition **3D + Schéma**, une poignée horizontale sépare les deux vues (**Redimensionner la vue 3D et le schéma**). Glissez-la pour changer le partage ; un double-clic le rétablit. Le partage est gardé dans le navigateur. La disposition choisie l'est aussi.

Basculer d'une disposition à l'autre ne perd rien : la caméra 3D, le défilement du schéma et les champs en cours de saisie restent.

Sans Pantin ouvert, seule la vue 3D vide est affichée, sous la [fenêtre d'accueil](/reference/panels#la-fenetre-d-accueil).

Le menu **Affichage** et la barre d'outils sont aussi les endroits où s'activent les actions de caméra ; les boutons **Cadrer tout** et **Cadrer la sélection** ne fonctionnent que lorsque la vue 3D est affichée.

## La vue 3D

La vue 3D est le seul endroit où le viewer dessine la machine. Elle ne calcule rien : elle affiche les positions que le cœur envoie en continu, et interpole entre deux envois pour rester fluide.

Sous la vue, une ligne d'aide rappelle les gestes de souris selon le préréglage de navigation choisi (**Souris : SolidWorks** ou **Souris : ZW3D**).

### Naviguer

| Geste | Effet |
| --- | --- |
| Rotation, déplacement, zoom à la souris | Dépendent du préréglage choisi dans **Affichage** : **Souris : SolidWorks** ou **Souris : ZW3D**. Le bouton gauche n'a pas d'action de caméra : il sélectionne. |
| Molette | Zoome. L'entrée **Inverser le sens de la molette** du menu **Affichage** change le sens. |
| Flèches du clavier | Tournent la caméra par pas. La taille du pas est réglée par l'entrée **Pas des flèches** du menu **Affichage**. Le focus doit être sur la vue (cliquez dedans). |
| **Perspective** (menu **Affichage**) | Case à cocher : active ou désactive la perspective de la caméra. |

Les différences exactes entre les deux préréglages (quel bouton fait quoi, avec quelles touches) sont dans [Raccourcis](/reference/shortcuts).

::: warning Non vérifié
Le sens de molette du préréglage ZW3D n'a pas été confronté au vrai ZW3D : Pantin utilise le sens de Babylon.js (pousser la molette vers l'avant zoome). Le préréglage SolidWorks, lui, zoome en arrière en poussant vers l'avant (spike 0007).
:::

### Le cube des vues

![Le cube des vues, en haut à droite de la vue 3D](/screenshots/fr/view-cube.webp)

Un petit cube est dessiné dans la vue ; il tourne avec la caméra. Son rôle : regarder la machine depuis une direction précise, d'un clic. Il est visible quand la vue 3D est affichée.

| Élément du cube | Effet du clic |
| --- | --- |
| Une face (nommée **Face**, **Arrière**, **Gauche**, **Droite**, **Dessus**, **Dessous**) | La caméra tourne vers cette vue standard. |
| Une arête ou un coin | La caméra tourne vers cette direction oblique. |
| Le survol | Allume toutes les cellules du cube qui demandent la même vue. |

La caméra tourne en 300 ms. Après un clic, le clavier retourne à la vue : les flèches continuent à tourner la caméra. Trois axes sortent du cube et suivent son orientation.

### Les vues standard

Sept vues standard existent : **Face**, **Arrière**, **Gauche**, **Droite**, **Dessus**, **Dessous**, **Isométrique**. Il y a trois façons de les choisir :

- cliquer une face du cube des vues ;
- appuyer sur **Espace** (le focus sur la vue ou la page, pas sur un bouton, l'arborescence ou le schéma) : une liste des vues apparaît à la position du pointeur, avec les flèches haut et bas et **Échap** pour fermer ;
- les touches de raccourci, indiquées dans [Raccourcis](/reference/shortcuts), ou le menu **Affichage**.

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

Un corps ou un assemblage sélectionné prend une teinte bleue (la couleur de sélection) et un contour. Quand vous sélectionnez une liaison (ou que vous remplissez son formulaire), ses deux corps sont teintés : le parent en jaune-orangé, l'enfant (le corps qui bouge) en bleu et cerné d'un contour, comme les pastilles (disque pour le parent, carré cerné pour l'enfant) du [formulaire de liaison](/reference/panels#nouvelle-liaison). Une flèche montre l'axe de la liaison et son sens positif ; elle est bleue, avec un disque (collerette) à la base de sa tige quand un actionneur déplace la liaison. Les faces pointées pour un alignement suivent la même logique : la face de la pièce qui bouge est bleue et cernée d'un contour, la face de la cible est jaune-orangé sans contour. Un marqueur de capteur et un faisceau lumineux sont verts, épais et opaques quand le signal est actif, neutres, fins et translucides sinon.

### Les capteurs dans la vue

Chaque capteur de liaison est dessiné dans la vue : un tronçon épais de l'axe pour un capteur de plage, un arc pour un pivot, un anneau sinon. Il s'allume (vert, plus épais et opaque) quand son tag d'état est à 1 et reste neutre, fin et translucide à 0 ; voir [Lire les couleurs et les repères](/reference/colours). Le viewer ne calcule jamais cet état : il lit le tag.

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

Un lien relie deux connecteurs. Il y en a de cinq sortes, nommées dans les info-bulles et pour les lecteurs d'écran : **Liaison pneumatique**, **Liaison de puissance alternative**, **Liaison d'asservissement** (d'un préactionneur à un actionneur), **Liaison mécanique** (d'un actionneur à une liaison) et **Liaison d'observation** (d'un capteur à une liaison). Chaque sorte a son style de trait, une courte étiquette écrite sur le fil et sa couleur, pour que la couleur ne soit jamais le seul repère : **PNEU** pneumatique (longs tirets, bleu ciel), **CA** puissance alternative (trait plein épais, presque blanc en thème sombre, presque noir en thème clair), **SERVO** asservissement (pointillés, pourpre rougeâtre), **MÉC** mécanique (trait plein fin, gris) et **OBS** observation (tiret et point, bleu). Ces couleurs ne sont jamais l'ambre, le rouge ou le vert des états, ni l'orange de Pantin.

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

Le schéma est mis à jour quatre fois par seconde à partir des tags et de l'état des préactionneurs. Le viewer ne déduit rien : il affiche ce que le cœur rapporte.

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
| Illisible | **Le fichier io.json est illisible, ou d'anciens fichiers io.csv sont présents : aucune modification n'est possible ici. Corrigez le fichier ou migrez-le avec « pantin io migrate ».** |
| Échec de lecture | **La liste d'E/S n'a pas pu être lue.** et le bouton **Réessayer**. |
| Édition | L'éditeur complet, décrit ci-dessous. |

Si une lecture échoue alors qu'un mapping était déjà affiché, la vue ajoute **Le mapping affiché peut être périmé : la dernière lecture a échoué.** avec **Réessayer**.

**Créer le mapping** crée la liste d'E/S en ajoutant un premier module, choisi par le cœur. En ligne de commande, `pantin io init` crée le fichier et le pré-remplit.

### La barre et la liste des problèmes

| Contrôle | Effet | Grisé quand |
| --- | --- | --- |
| **Exporter la GVL** | Télécharge la GVL CODESYS du mapping affiché, modifications non enregistrées comprises. | Voir ci-dessous |

Le bouton reste visible mais inactif (info-bulle explicative) quand :

- le mapping n'est pas encore lu (**Le mapping n'est pas encore lu : la GVL n'est pas disponible.**) ;
- il n'y a pas de mapping (**Pas de mapping : créez-le d'abord pour exporter la GVL.**) ;
- le mapping a des problèmes (**Le mapping a des problèmes : corrigez-les (liste ci-dessous) pour exporter la GVL.**).

Sous le bouton, **Problèmes (n)** liste tout ce que le cœur trouve à redire. Un problème attaché à une cellule est un bouton (info-bulle **Aller à la cellule concernée**) : il sélectionne le module, défile jusqu'à la cellule et lui donne le focus. Un problème qui concerne le fichier entier est un simple texte, préfixé **Fichier entier :**. La liste disparaît quand il n'y en a plus.

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

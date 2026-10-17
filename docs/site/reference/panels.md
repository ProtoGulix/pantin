# Panneaux et boutons

Cette page liste chaque bouton, champ et commande des panneaux du viewer, zone par zone. Pour chaque contrôle : son **libellé** tel que l'interface l'affiche, ce qu'il fait, et quand il est grisé.

Les menus (**Fichier**, **Édition**, **Affichage**) sont décrits dans [Menus](/reference/menus). Les combinaisons de touches et de souris sont dans [Raccourcis clavier et souris](/reference/shortcuts). La disposition générale de l'écran est dans [L'écran](/reference/interface). Les trois vues centrales (3D, Schéma, E/S) sont dans [Vues centrales](/reference/views).

::: tip Lire les tableaux
« Grisé » veut dire que le bouton est visible mais inactif. Quand un bouton est grisé pour une raison précise, l'info-bulle (au survol) donne souvent cette raison. Un champ « validé en le quittant » envoie sa valeur quand vous appuyez sur **Entrée** ou que vous cliquez ailleurs.
:::

## La barre d'outils

Elle se trouve sous la barre de menus, au-dessus de l'arborescence. Elle n'existe que lorsqu'un Pantin est ouvert (sans Pantin, c'est la [fenêtre d'accueil](#la-fenetre-d-accueil) qui prend le relais).

| Contrôle | Ce qu'il fait | Grisé quand |
| --- | --- | --- |
| **Fermer le Pantin (retour à l'accueil)** (flèche) | Ferme le Pantin et revient à l'accueil. Si le Pantin a des modifications non sauvegardées, une [confirmation](#les-confirmations) demande quoi faire. | Jamais |
| **Enregistrer** | Écrit le Pantin sur le disque. Quand il y a des modifications non sauvegardées, l'info-bulle devient **Enregistrer (modifications non sauvegardées)** et un point apparaît sur le bouton. | Aucune modification non sauvegardée, ou une requête est en cours |
| **Importer un fichier 3D (GLB, STL, STEP) dans le Pantin ouvert** | Ouvre le sélecteur de fichiers du navigateur, puis le [formulaire d'import](#le-formulaire-d-import). | Une requête ou un import est en cours |
| **Cadrer tout** | Place la caméra 3D pour voir tous les corps. | Aucun corps, ou la vue 3D n'est pas affichée (disposition **Schéma** ou E/S) |
| **Cadrer la sélection** | Place la caméra 3D sur l'élément sélectionné dans l'arborescence. | Aucun corps, aucun nœud de l'arborescence sélectionné, ou vue 3D non affichée |
| **Vue centrale** : **3D** / **Schéma** / **3D + Schéma** | Trois boutons à bascule, un seul enfoncé : choisit ce que la zone centrale affiche. L'info-bulle donne le nom complet (**3D seule**, **Schéma des chaînes seul**, **3D + Schéma**). | Jamais |
| Compteur de la console (icônes erreur et avertissement avec deux nombres) | Affiche le nombre d'erreurs et d'avertissements de la [console](#la-console). Un clic ouvre ou ferme la console. Le bouton est enfoncé quand la console est ouverte. | Jamais |
| Roue d'attente (**Traitement en cours**) | Indicateur, pas un bouton : une requête est en cours. | Sans objet |

::: info La disposition E/S
La barre d'outils n'a que trois boutons de vue. La disposition **E/S seules** se choisit dans le menu **Affichage**, ou avec le bouton **Config E/S** de la [carte Pont automate](#la-carte-pont-automate). La touche **F4** fait tourner entre **3D + Schéma**, **3D seule** et **Schéma des chaînes seul**, et ne passe jamais par la vue E/S.
:::

## Le panneau de gauche

De haut en bas : la barre d'outils, le formulaire d'import (seulement pendant un import), l'arborescence, la carte **Pont automate**, la ligne de confirmation, la ligne de message. Une poignée entre le panneau et la zone centrale permet de le redimensionner (**Redimensionner le panneau**).

### L'arborescence

L'arborescence montre un seul Pantin, avec toute sa structure. Un clic sélectionne une ligne et affiche ses propriétés dans l'[inspecteur](#l-inspecteur). Les touches de navigation sont dans [Raccourcis](/reference/shortcuts).

Le Pantin contient ses assemblages, puis un dossier **Liaisons entre assemblages** (avec le nombre de liaisons en détail). Un assemblage contient dans l'ordre : ses sous-assemblages, ses corps, ses liaisons internes, puis des dossiers d'éléments : **Chaîne d'action** (préactionneurs, actionneurs, capteurs), **Convoyage** (bandes, guides, cellules de présence), **Flux de produits** (émetteurs, absorbeurs). Un corps liste les liaisons qui le tiennent (avec « parent » ou « enfant »), puis ses **Nœuds d'origine** (les nœuds du fichier CAO, en grisé).

| Partie d'une ligne | Ce qu'elle fait |
| --- | --- |
| Chevron | Plie ou déplie la branche. Absent quand la ligne n'a pas de contenu. |
| Icône et nom | Un clic sélectionne. Un double-clic renomme les lignes renommables (Pantin, assemblage, corps) ; sur les autres, il ouvre l'inspecteur et plie ou déplie la ligne. |
| Texte grisé à droite (détail) | Pantin : le nombre de corps. Assemblage : sa clé, c'est-à-dire le préfixe de ses tags. Liaison : son type. Élément : son type, et le corps où il est placé quand il en a un. |
| Éclair | Sur une liaison déplacée par un actionneur. Un clic ouvre le formulaire de cet actionneur (**Modifier l'actionneur**). |
| Marque de capteur | Sur une liaison surveillée. Un clic ouvre le formulaire de son premier capteur. |
| Oeil | Sur un assemblage. Un clic le masque ou l'affiche dans la vue 3D (**Masquer dans la vue 3D** / **Afficher dans la vue 3D**). L'état n'est jamais enregistré. |
| Marque rond à droite | Sur un capteur : plein quand son tag d'état est à 1 (**Activé**), vide à 0 (**Désactivé**). Lue sur les tags, jamais calculée par le viewer. |
| Ligne teintée « liée » | Quand un élément de la chaîne d'action est sélectionné, les liaisons qu'il déplace ou surveille sont teintées. |

Glisser un corps sur un assemblage (ou sur un corps de cet assemblage) le déplace dans cet assemblage. La même opération existe au clavier avec la liste **Assemblage** de l'inspecteur.

::: info Texte des lecteurs d'écran
Les icônes ne portent pas de texte : chaque ligne a aussi un texte caché qui dit son type et son état (par exemple « déplacée par Vérin 1 », « surveillée par Fin de course haute », « masqué »).
:::

### Le menu contextuel d'une ligne

![Le menu contextuel d'un assemblage dans l'arborescence](/screenshots/fr/tree-context-menu.webp)

Clic droit sur une ligne (ou touche **Menu**). L'entrée se propose seulement quand elle a un sens pour la ligne.

| Entrée | Sur | Ce qu'elle fait |
| --- | --- | --- |
| **Renommer** | Pantin, assemblage, corps | Passe le nom en édition dans l'arborescence. |
| **Cadrer la vue sur l'élément** | Pantin, assemblage, dossier, corps, liaison... (pas les éléments de chaîne) | Cadre la caméra 3D sur la ligne. |
| **Importer dans ce Pantin** | Pantin | Ouvre le sélecteur de fichiers. |
| **Nouvel assemblage** | Pantin | Crée un assemblage vide (nom par défaut **Nouvel assemblage**). |
| **Nouvelle liaison…** | Assemblage, dossier **Liaisons entre assemblages** | Ouvre le [formulaire de liaison](#nouvelle-liaison). |
| **Changer le type…** | Liaison | Ouvre le formulaire de la liaison, prérempli. |
| **Ajouter un actionneur…** / **Modifier son actionneur…** | Liaison mobile | Ouvre le formulaire d'actionneur pour cette liaison. L'entrée dit **Modifier** si la liaison a déjà un actionneur. Absente sur une liaison fixe. |
| **Ajouter un capteur…** | Liaison mobile | Ouvre le formulaire de capteur pour cette liaison. |
| **Ajouter les fins de course** | Liaison à course limitée | Crée d'un coup les deux fins de course aux extrémités. Absente sur une liaison fixe ou continue (sans limites). |
| **Masquer dans la vue 3D** / **Afficher dans la vue 3D** | Assemblage | Masque ou affiche l'assemblage. |
| **Isoler dans la vue 3D** / **Afficher tous les assemblages** | Assemblage | Ne garde que cet assemblage visible ; l'entrée devient **Afficher tous les assemblages** pour tout rétablir. |
| **Supprimer** | Corps, liaison, assemblage | Demande confirmation (voir [les confirmations](#les-confirmations)). |
| **Modifier** | Élément (préactionneur, actionneur, capteur, objet de convoyage) | Ouvre son formulaire. |
| **Afficher dans E/S** | Élément qui possède des tags | Bascule en vue E/S sur ses tags. |
| **Supprimer** | Élément | Supprime l'élément sans confirmation. |

Échap ou un clic ailleurs ferme le menu.

### Le formulaire d'import

![Le formulaire d'import sous la barre d'outils, avec la liste Axe vertical](/screenshots/fr/import-form.webp)

Il s'ouvre sous la barre d'outils après le choix d'un fichier (**Fichier 3D à importer**) via **Importer un fichier 3D...**, **Importer…** ou **Importer dans ce Pantin**. Les formats acceptés sont `.glb`, `.stl`, `.stp` et `.step` ; un autre fichier produit un message d'erreur.

| Contrôle | Ce qu'il fait | Grisé quand |
| --- | --- | --- |
| Titre **Import dans « nom »** | Rappelle le Pantin cible. | Sans objet |
| Nom du fichier et pastille de format (**GLB**, **STL**, **STEP**) | Rappellent le fichier choisi. | Sans objet |
| **Unité** | Unité de longueur du fichier : **m (mètres)**, **mm (millimètres)**, **cm (centimètres)**, **in (pouces)**. Affichée seulement pour un STL : les autres formats portent leur propre unité. | Pendant l'import |
| **Axe vertical** | **Y vers le haut (standard glTF)** ou **Z vers le haut (CAO)**. | Pendant l'import |
| **Importer** | Lance l'import. | Un import ou une requête est en cours |
| **Annuler** | Abandonne l'import. | Remplacé par la roue d'attente pendant l'import |

Pendant l'import, le formulaire affiche **Import en cours…**. Pour un STEP : **Conversion STEP en cours… Jusqu'à 2 minutes ; gardez cette page ouverte.**

### La carte Pont automate

![La carte Pont automate, pont arrêté](/screenshots/fr/bridge-stopped.webp)

![La carte Pont automate, pont en marche](/screenshots/fr/bridge-running.webp)

La carte est tout en bas du panneau de gauche. Elle est visible dans toutes les dispositions centrales. Elle apparaît dès que le cœur répond sur l'état du pont.

La ligne d'état affiche une pastille de couleur et le texte de l'état, suivis d'une pastille cliquable qui dit le mode réseau.

| État | Pastille | Bouton d'action |
| --- | --- | --- |
| **Arrêté** | neutre | **Démarrer** |
| **Démarrage…** | occupé | **Arrêter** |
| **En marche** | vert | **Arrêter** |
| **Arrêt…** | occupé | **Arrêter** (grisé) |
| **En échec** | rouge | **Redémarrer** |

| Contrôle | Ce qu'il fait | Grisé quand |
| --- | --- | --- |
| **Journal** (info-bulle **Ouvrir le journal du pont automate**) | Ouvre la fenêtre [**Journal du pont automate**](#le-journal-du-pont-automate). Toujours affiché, à gauche de **Config E/S**. | Jamais |
| **Config E/S** (info-bulle **Configurer les E/S**) | Passe en vue E/S, où se règlent les modules. Reste marqué « actif » quand la vue E/S est affichée. | Jamais |
| **Démarrer** / **Arrêter** / **Redémarrer** | Lance, arrête ou relance le pont. L'icône suit l'action. Un arrêt n'est jamais bloqué, sauf pendant **Arrêt…**. | Une demande au pont est en cours ; pour **Démarrer** et **Redémarrer** seulement, le pont est indisponible (le cœur n'a pas de pont configuré) ou un pont lancé hors de Pantin est déjà connecté ; **Arrêter** n'est bloqué par aucune de ces deux raisons |
| Pastille **Réseau : local** / **Réseau : réseau privé** | Déplie ou replie les réglages réseau. Elle redit le mode même repliée. Elle reste ouverte tant qu'une erreur réseau est affichée. | Jamais |
| **Local uniquement (127.0.0.1)** | Le pont écoute seulement sur la machine locale. | Pont en marche, démarrage ou arrêt ; pont indisponible |
| **Réseau privé** | Le pont écoute sur une adresse du réseau local. Fait apparaître les deux champs suivants. | Idem |
| **Adresse d'écoute** | Liste des adresses locales proposées par le cœur. Présent en mode **Réseau privé**. | Idem |
| **Automates autorisés (IP ou CIDR, séparés par des virgules)** | Liste blanche des adresses d'automates admises. Validée en quittant le champ. Présent en mode **Réseau privé**. | Idem |

Sous la ligne d'état, selon le contexte :

| Zone | Contenu |
| --- | --- |
| Note | Raison pour laquelle le bouton ou les réglages sont inactifs : « Démarrez le cœur avec `--bridge-python <chemin>` (`pnpm setup:python`). » quand le pont est indisponible, ou **Un pont lancé hors de Pantin est connecté.** quand un autre pont tient déjà la place. |
| Erreur réseau | Le refus du cœur (adresse non privée, liste invalide...) s'affiche en rouge et force l'ouverture des réglages réseau. |
| Lignes de modules | Une ligne par module d'E/S : pastille, **clé** du module (`m1`...), adresse `adresse:port` que l'automate doit viser, et statut en texte : **pont arrêté**, **en attente de l'automate** ou **automate connecté**. Pont arrêté : les lignes viennent de la liste d'E/S et l'adresse est celle qu'un démarrage utiliserait. Pont en marche : elles viennent de ce que le cœur rapporte. |
| **Aucun module : configurez les E/S** | Remplace les lignes quand la liste d'E/S n'a aucun module. |
| **Toute modification des E/S arrête le pont.** | Rappel affiché pendant que le pont est en marche. |
| **n tag(s) forcé(s) : l'automate ne peut pas les écrire** et bouton **Relâcher tout (n)** | Affichés quand le pont est en marche et que des tags sont forcés depuis le viewer. Le bouton les rend tous à l'automate. |
| Bloc d'échec (rôle alerte) | Quand l'état est **En échec** : un titre (**Le pont refuse sa configuration**, **Le pont ne joint pas le cœur**, **La liste d'E/S n'est pas valide**, **Les E/S ont changé : redémarrez le pont**, **Le pont a perdu la liaison avec le cœur**, **Erreur de protocole entre le pont et le cœur**, **Erreur inattendue du pont**, **Le pont n'a pas pu être lancé**, **Le pont n'a pas démarré à temps**, **Le pont s'est arrêté brutalement**), le message du pont (en anglais) et un volet **Journal du pont**. **Les E/S ont changé** s'affiche en avertissement, pas en erreur : rien n'est cassé. |

Fermer le Pantin pendant que le pont tourne ajoute une question à la [confirmation](#les-confirmations) : **Le pont automate continue de tourner quand le Pantin est fermé.**

### Les confirmations

Une confirmation s'affiche en ligne, au-dessus de la ligne de message, à la place d'une fenêtre. Elle prend le clavier : **Entrée** valide le bouton principal, **Échap** choisit **Annuler**. Les boutons sont grisés pendant une requête, pour qu'un choix ne parte jamais deux fois. Dans toutes les questions de suppression, **Supprimer** est le bouton principal.

| Question | Boutons |
| --- | --- |
| **Le Pantin « nom » a des modifications non sauvegardées.** | **Enregistrer** (principal), **Ne pas enregistrer**, **Annuler** |
| La même, avec un pont en marche | Ajoute la case **Arrêter aussi le pont** |
| **Le pont automate continue de tourner quand le Pantin est fermé.** (sans modification en attente) | **Arrêter le pont et fermer** (principal), **Fermer sans arrêter le pont**, **Annuler** |
| **Supprimer le corps « nom » ?** | **Supprimer**, **Annuler** |
| **Supprimer la liaison « nom » ?** | **Supprimer**, **Annuler** |
| **Supprimer l'assemblage « nom » et tout son contenu ?** | **Supprimer**, **Annuler**. Une liste dit ce qui disparaît : corps, liaisons de l'assemblage, liaisons avec d'autres assemblages, préactionneurs, actionneurs, capteurs, sous-ensembles, tags supprimés et tags ajoutés, et les assemblages qui perdent leur rattachement. |
| **Supprimer n fichier(s) orphelin(s) du dossier meshes ?** (menu **Fichier**, **Nettoyer les fichiers orphelins…**) | **Supprimer**, **Annuler**. La liste donne les fichiers et leur taille. |
| **Remplacer l'alimentation de ... par une alimentation depuis ... ?** (nouveau lien dans le schéma) | **Remplacer**, **Annuler** |

La suppression d'un préactionneur, d'un actionneur, d'un capteur ou d'un objet de convoyage ne demande aucune confirmation.

### La ligne de message

Une ligne en bas du panneau montre le dernier message : une icône **Erreur** ou **Information**, le texte, éventuellement un détail (le texte du cœur) et des liens vers des éléments nommés. Un clic sur un lien sélectionne l'élément. Le bouton **Fermer le message** l'efface.

## L'inspecteur

Le panneau de droite. Il s'ouvre et se ferme par le menu **Affichage**, ou par la croix du panneau (info-bulle **Annuler**). Il montre ce qui est sélectionné dans l'arborescence, dans la vue 3D ou dans le schéma. Il garde la forme suivante, de haut en bas :

1. le titre **Inspecteur** ;
2. la barre d'outils de l'inspecteur ;
3. le formulaire en cours (liaison, préactionneur, actionneur, capteur ou objet de convoyage), s'il y en a un ;
4. le curseur de position, pour une liaison ;
5. le sujet (par exemple **Préactionneur · Distributeur 1**) ;
6. le bouton **Créer un produit**, pour un émetteur ;
7. la section **Positionnement**, pour un assemblage ou un corps ;
8. le tableau **Propriété** / **Valeur**, dont les sections se plient avec leur en-tête, puis la section **E/S**.

Sans sélection, l'inspecteur dit : **Rien à montrer ici : sélectionnez un élément dans l'arborescence, la vue 3D ou le schéma.**

### La barre d'outils de l'inspecteur

Trois groupes d'icônes, séparés par un trait. Un groupe qui ne s'applique pas à la sélection est omis. L'info-bulle de chaque icône est son nom.

| Groupe | Icône | Ce qu'elle fait | Grisée quand |
| --- | --- | --- | --- |
| Créer | **Nouveau préactionneur** | Ouvre le formulaire de préactionneur. | Jamais |
| Créer | **Nouvel actionneur** | Ouvre le formulaire d'actionneur. | Aucune liaison mobile (glissière ou pivot) n'existe. L'info-bulle dit : **Créez d'abord une glissière ou un pivot : un actionneur déplace des liaisons.** |
| Créer | **Nouveau capteur** | Ouvre le formulaire de capteur. | Même raison que l'actionneur |
| Créer | **Nouvelle bande**, **Nouveau guide**, **Nouvel émetteur**, **Nouvel absorbeur**, **Nouvelle cellule de présence** | Ouvrent le formulaire de l'objet. | Aucun assemblage (**Il faut d'abord un assemblage.**) ; pour la bande, aucune liaison pivot continu pour le tambour (**Il faut d'abord une liaison pivot continu pour le tambour.**) |
| Positionner | **Déplacer (G)**, **Tourner (R)** | Active le manipulateur de placement dans la vue 3D (bouton à bascule). Avec un corps sélectionné, la sélection passe à son assemblage. | Aucun assemblage sélectionné, ou vue 3D non affichée |
| Positionner | **Repère local de l'assemblage (L)** / **Repère du support (L)** | Choisit les axes du manipulateur : ceux de l'assemblage ou ceux de son support. | Mêmes raisons |
| Positionner | **Aligner (A)** | Démarre ou arrête un alignement par faces. | Mêmes raisons, sauf pour arrêter un alignement en cours |
| Positionner | Champ de pas (**Pas du déplacement, en mm** ou **Pas de la rotation, en degrés**) | Pas d'aimantation du manipulateur, validé en le quittant. Maintenir **Ctrl** pendant un glissement supprime l'aimantation. Visible seulement quand **Déplacer** ou **Tourner** est actif. | Jamais |
| Positionner | **Rétablir le placement précédent** | Renvoie le placement gardé avant la dernière modification. | Rien à rétablir (l'info-bulle dit **rien à rétablir**), ou l'ancrage de l'assemblage a changé |
| Élément | **Modifier** | Ouvre le formulaire de l'élément sélectionné. | Jamais |
| Élément | **Supprimer** | Supprime l'élément sélectionné, sans confirmation. | Jamais |

La croix du titre ferme l'inspecteur.

### Les en-têtes de section

Chaque section du tableau commence par une ligne d'en-tête : un chevron et le nom de la section (**Général**, **Paramètres**, **Commandes**, **Retours**, **Défauts**...). Cliquer l'en-tête plie ou déplie la section. L'état plié est gardé pour la session, par section : il survit à un changement de sélection.

### Les lignes du tableau

| Type de ligne | Aspect | Comportement |
| --- | --- | --- |
| Texte lecture seule | Valeur en clair | Rien à faire. Les lignes grisées (nœuds d'origine, **Tags** d'une liaison) sont informatives. |
| Champ texte | Champ éditable | Validé en le quittant ou par **Entrée**. **Échap** annule. Une valeur refusée reste dans le champ, marquée, avec la raison sous la section (rôle alerte). |
| Liste | Liste déroulante | Applique le choix tout de suite. |
| Lien | Valeur en bouton | Un clic sur la ligne sélectionne ce qu'elle nomme (un corps, une liaison, un élément). |
| Valeur vivante | Texte mis à jour quatre fois par seconde | Position, états, tags de retour. Un bit s'affiche **Marche** ou **Arrêt**. Le nom complet du tag est l'info-bulle de la ligne. |
| Bouton à bascule (**Marche** / **Arrêt**) | Bouton enfoncé ou non | Voir ci-dessous. |
| Champ numérique et **Envoyer** | Champ, bouton, valeur courante | Voir ci-dessous. |

#### Forcer un tag : bascule, Envoyer, Relâcher

Les commandes d'un préactionneur et la consigne d'une liaison sans actionneur sont des tags que le viewer peut écrire, comme le ferait l'automate.

| Contrôle | Ce qu'il fait |
| --- | --- |
| Bouton **Marche** / **Arrêt** (commande booléenne) | Écrit l'inverse de la valeur lue. Le bouton garde un nom fixe pour les lecteurs d'écran ; l'état est dans « enfoncé ». |
| Champ numérique | Saisissez une valeur en mm, en degrés, en mm/s... selon le libellé de la ligne. |
| **Envoyer** (ou **Entrée** dans le champ) | Écrit la valeur saisie. Un texte qui n'est pas un nombre n'envoie rien. |
| Marque **forcé** (cadenas) | Apparaît sur la ligne dès que le tag est forcé. Elle dit en texte, pas seulement en couleur, que l'écriture vient du viewer. L'info-bulle explique : **Forcé depuis le viewer : l'automate ne peut pas écrire ce tag tant qu'il n'est pas relâché**. |
| **Relâcher** (cadenas ouvert, info-bulle **Relâcher le tag nom**) | Rend le tag à l'automate. La marque disparaît. Le focus clavier reste sur la ligne. |

Tant qu'un tag est forcé, les écritures de l'automate sur ce tag sont ignorées (et notées dans la console). **Relâcher tout** est dans la [barre de transport](#la-barre-de-transport) et dans la carte du pont.

### Ce que l'inspecteur montre selon la sélection

#### Un Pantin

| Section | Lignes |
| --- | --- |
| **Général** | **Nom** (éditable), **Identifiant**, **Nombre de corps**, **Modifications non sauvegardées** (**Oui** / **Non**) |
| Index des éléments | Voir « Index » ci-dessous |

#### Un assemblage

| Section | Lignes |
| --- | --- |
| **Général** | **Nom** (éditable), **Clé (préfixe des tags)** (éditable ; la renommer renomme les tags), **Contenu dans** (si sous-assemblage, lecture seule), **Nombre de corps** |
| **Positionnement** (titre : **Position dans « ancrage »** ou **Position dans le monde**) | **Repère** (l'assemblage de référence, ou **monde**), puis six champs éditables : **X**, **Y**, **Z** en mm, **RX**, **RY**, **RZ** en degrés |
| Index des éléments | Voir « Index » ci-dessous |

Taper une valeur invalide garde le texte dans le champ, marqué, avec **Valeur refusée : tapez un nombre.** Pendant un glissement du manipulateur, les champs montrent la valeur en cours (marquée « glissée »). **Entrée** passe au champ suivant.

#### Un corps

| Section | Lignes |
| --- | --- |
| **Général** | **Nom** (éditable), **Identifiant**, **Assemblage** (liste : déplace le corps dans un autre assemblage, ce qui déplace sa liaison parent et fait suivre ses tags) |
| **Placement** | Seulement si le corps a un placement : **Repère**, X, Y, Z, RX, RY, RZ, en lecture seule |
| **Liaisons** | Une ligne par liaison qui tient le corps (rôle : « enfant de ... » ou « parent de ... »), cliquable ; ou **Aucune liaison** |
| **Source** | **Fichier**, **Format**, **Unité**, **Axe vertical** |
| **Maillage** | **Fichier maillage** |
| **Nœuds d'origine** | Chemin et nom de chaque nœud du fichier CAO (ou **(aucun nœud dans le fichier)**) |
| **Positionnement** | Une ligne dit **Se place avec l'assemblage « nom »**, avec les outils de placement de la barre |

#### Un dossier ou un nœud d'origine

Un dossier (par exemple **Liaisons entre assemblages**) montre **Nom** et **Nombre d'éléments**. Un nœud d'origine montre **Nom d'origine** et **Chemin**, en grisé.

#### Une liaison

![L'inspecteur d'une liaison glissière, avec son curseur de position](/screenshots/fr/inspector-joint.webp)

Sous le sujet **Liaison · nom** apparaît le curseur **Position de « nom »** : il déplace la liaison à la main, en mm ou en degrés, entre ses limites. Il envoie au plus 30 positions par seconde et suit le flux du cœur quand vous ne le tenez pas.

| Section | Lignes |
| --- | --- |
| **Général** | **Nom**, **Identifiant**, **Clé de tag** (éditable), **Tags** (en grisé : la consigne et la position, ou **Aucun tant que la liaison est fixe**), **Type** (liste : ouvre le formulaire de liaison pour saisir les paramètres du nouveau type), **Corps parent**, **Corps enfant** (listes) |
| **Repère de la liaison** | **Axe** (**X**, **Y**, **Z** ou **Autre**), **Sens** (**Positif (+)** / **Inversé (−)**), les trois composantes de l'axe si **Autre**, puis **Origine X / Y / Z (mm)** |
| **Paramètres** | Selon le type : **Limites** (bas et haut), **Pas (course par tour)** pour l'hélicoïdale |
| **Position** | Absente sur une liaison fixe. **Position** (valeur vivante), **Grippée** (bascule : défaut injectable), et **Consigne** (champ numérique avec **Envoyer**, seulement quand aucun actionneur ne déplace la liaison) |
| **Liens** | **Actionneur** (cliquable, ou **Aucun : clic droit sur la liaison pour en ajouter un**) et un lien **Capteur** par capteur qui la surveille |
| **E/S** | Voir [la section E/S](#la-section-e-s-de-l-inspecteur) |

Les types de liaison sont : **Fixe**, **Glissière**, **Pivot limité**, **Pivot continu**, **Hélicoïdale (vis et écrou)**.

#### Un préactionneur

Sujet **Préactionneur · nom**.

| Section | Lignes |
| --- | --- |
| **Général** | **Nom** (éditable), **Type**, **Préfixe des tags** (`assemblage.clé`) |
| **Paramètres** | Les paramètres du type (vitesses, rampes...), éditables, avec leur unité |
| **Commandes** | Les tags que l'automate écrit : bascule **Marche** / **Arrêt** pour un bit, champ et **Envoyer** pour une valeur. Marque **forcé** et **Relâcher** par ligne. |
| **Retours** | Les tags que l'automate lit (valeurs vivantes) |
| **Défauts** | **Ne répond plus** (bascule : le préactionneur ignore ses commandes), et **Diagnostic** |
| **E/S** | Voir [la section E/S](#la-section-e-s-de-l-inspecteur) |

La ligne **Diagnostic** dit **Aucun** quand tout va bien. Sinon elle affiche un avertissement, par exemple pour un distributeur : **Commandes contradictoires : les deux bobines sont actives ; le tiroir reste en place.** Le même avertissement apparaît sous le nœud dans le [schéma](/reference/views#le-schema-des-chaines) et dans la console.

Types de préactionneurs : **Distributeur 3/2, monostable**, **Double distributeur 3/2**, **Distributeur 5/2, monostable**, **Distributeur 5/2, bistable**, **Distributeur 5/3, centre fermé**, **Distributeur 5/3, centre ouvert à l'échappement**, **Distributeur 5/3, centre en pression**, **Contacteur**, **Contacteur inverseur**, **Variateur, marche/arrêt**, **Variateur, consigne analogique**, **Variateur d'axe asservi**.

#### Un actionneur

Sujet **Actionneur · nom**. Sections : **Général** (**Nom**, **Type**) et **Paramètres** (éditables, avec leur unité). L'alimentation et les liaisons déplacées n'y sont pas répétées : le [schéma](/reference/views#le-schema-des-chaines) les dessine, et le formulaire **Modifier** permet de les changer. Pas de section **E/S** : un actionneur n'a pas de tag.

Types d'actionneurs : **Vérin double effet**, **Vérin simple effet**, **Moteur alternatif**, **Servomoteur**.

#### Un capteur

Sujet **Capteur · nom**. Sections : **Général** (**Nom**, **Type**, **Préfixe des tags**), **Paramètres** (plage, résolution, hystérésis, **Normalement fermé**..., selon le type ; les choix et les cases à cocher sont des listes **Oui** / **Non**), **État** (les tags du capteur, en valeurs vivantes) et **E/S**.

Types de capteurs de liaison : **Contact idéal**, **Fin de course mécanique**, **Détecteur de vérin (magnétique)**, **Détecteur inductif (axial)**, **Codeur**.

#### Une bande, un guide, un émetteur, un absorbeur, une cellule de présence

Sujet **Bande · nom**, **Guide · nom**, **Émetteur · nom**, **Absorbeur · nom** ou **Cellule de présence · nom**.

| Section | Lignes |
| --- | --- |
| **Général** | **Nom** (éditable), **Type**, **Préfixe des tags** (émetteur et cellule seulement) |
| **Repère** | **Assemblage**, **Corps suivi** (ou **aucun (repère de l'assemblage)**), en lecture seule |
| **Placement** | **X**, **Y**, **Z** (mm), **RX**, **RY**, **RZ** (degrés), éditables |
| **Paramètres** | Selon l'objet (voir le formulaire ci-dessous) |
| **État** | Émetteur : **Création d'un produit** (bit). Cellule de présence : ses tags (par exemple l'état détecté). |
| **E/S** | Voir [la section E/S](#la-section-e-s-de-l-inspecteur) |

Pour un émetteur sélectionné, le bouton **Créer un produit** apparaît au-dessus du tableau. Il écrit 1 puis 0 sur le tag de création de l'émetteur : un produit apparaît au pas suivant. L'info-bulle le rappelle.

#### Index : ce qu'on voit sur un Pantin ou un assemblage

Sous les propriétés, des sections listent les éléments, une ligne chacun, avec nom et type. Un clic sur la ligne sélectionne l'élément.

| Section | Contenu |
| --- | --- |
| **Préactionneurs** | Une ligne par préactionneur. Sa valeur vivante montre les commandes actives. |
| **Actionneurs** | Une ligne par actionneur |
| **Capteurs** | Une ligne par capteur, avec son état |
| **Convoyage** | Bandes, guides, émetteurs, absorbeurs, cellules de présence (état de la cellule en valeur vivante) |

Une famille sans élément est expliquée en une phrase sous le tableau (par exemple **Aucun préactionneur : c'est lui que l'automate commande (distributeur, contacteur, variateur), par ses tags.**).

### La section E/S de l'inspecteur

Elle apparaît pour un élément qui possède des tags (liaison mobile, préactionneur, capteur, émetteur, cellule de présence), à la fin du tableau. Une ligne par tag :

| Contrôle | Ce qu'il fait | Grisé quand |
| --- | --- | --- |
| Nom du tag et état | Pastille de connexion du module (si le tag est affecté) et texte : `module · zone adresse` (par exemple `m1 · coil 0`) ou **non affecté**. | Sans objet |
| **Affecter** (tag non affecté) | Affecte le tag au module sélectionné dans la vue E/S, ou au premier module de la liste. | Aucun module (**Ajoutez un module dans la vue E/S pour affecter des tags.**), fichier `io.json` illisible (**io.json n'est pas modifiable : voir la vue E/S.**), ou requête en cours |
| **Ouvrir dans E/S** (tag affecté, icône) | Bascule en vue E/S et montre le tag dans son module. | Jamais |
| **Réessayer** (quand la liste est illisible) | Relit la liste d'E/S ; la section dit **E/S indisponible**. | Requête en cours |

## Les formulaires

Les formulaires s'ouvrent en tête de l'inspecteur (sauf l'import, qui est dans le panneau de gauche). Dans chacun, **Annuler** referme sans rien envoyer et le bouton principal (**Créer** à la création, **Appliquer** à la modification) envoie. Ce bouton est grisé pendant une requête. Un formulaire refusé par le cœur laisse son contenu en place et affiche un message.

### Nouvelle liaison

Titre **Nouvelle liaison dans « nom du Pantin »**, ou **Modifier la liaison « nom »**. **Entrée** valide, **Échap** annule.

| Champ | Rôle |
| --- | --- |
| **Type** | **Fixe**, **Glissière**, **Pivot limité**, **Pivot continu**, **Hélicoïdale (vis et écrou)**. Les lignes de paramètres en dessous changent avec le type. |
| **Nom** | Nom de la liaison. |
| **Corps parent**, **Corps enfant** | Listes des corps. Une pastille de couleur rappelle la teinte du corps dans la vue 3D. |
| **Axe (repère de « assemblage »)** | Boutons radio **X**, **Y**, **Z**, **Autre**. Avec **Autre**, trois champs de composantes apparaissent ; sinon la case **Sens inversé** apparaît. |
| **Prendre l'axe sur une face** | Attend un clic sur une face de la vue 3D, qui remplit l'origine et l'axe (texte **Cliquez une face dans la vue 3D (Échap : annuler)**). Présent seulement quand le formulaire modifie une liaison existante mobile. |
| **Inverser l'axe** | Inverse le sens de l'axe sans rien envoyer. |
| **Origine (repère de « assemblage »)** | Trois champs en mm. |
| Paramètres du type | **Limites** (**basse** et **haute**, en mm ou degrés selon le type), **Pas (course par tour)** pour l'hélicoïdale. |

Une phrase rappelle que l'axe est pris dans le repère du corps parent, Z vers le haut, et que la flèche de la vue 3D montre le sens positif de la course.

### Nouveau préactionneur

![Le formulaire Nouveau préactionneur dans l'inspecteur](/screenshots/fr/form-new-drive.webp)

Titre **Nouveau préactionneur** ou **Modifier le préactionneur**.

| Champ | Rôle |
| --- | --- |
| **Nom** | Nom du préactionneur. |
| **Type** | Voir la liste des types plus haut. Changer de type remplace les paramètres. |
| **Tags dans l'assemblage** | Assemblage dont la clé préfixe les tags. |
| Paramètres | Un champ par paramètre du type, avec son unité. |

Tant qu'aucun actionneur ne déplace de liaison, une note précise que les vitesses sont en mm (**Les vitesses sont dans l'unité des liaisons qu'il déplacera : en mm tant qu'il n'alimente aucun actionneur rotatif.**).

### Nouvel actionneur

![Le formulaire Nouvel actionneur dans l'inspecteur](/screenshots/fr/form-new-actuator.webp)

Titre **Nouvel actionneur** ou **Modifier l'actionneur**.

| Champ | Rôle |
| --- | --- |
| **Nom**, **Type**, **Tags dans l'assemblage** | Comme le préactionneur. |
| **Préactionneur qui l'alimente** | Liste des préactionneurs compatibles, ou **Aucun**. Si aucun ne convient : **Aucun préactionneur ne convient à ce type : créez-en un dont les sorties correspondent.** |
| Une liste par entrée du type | Choisit la sortie du préactionneur reliée à chaque entrée de l'actionneur. N'apparaît qu'avec un préactionneur. |
| **Liaisons qu'il déplace** | Une case à cocher par liaison mobile libre. |
| Paramètres | Un champ par paramètre du type, avec son unité. |

Si vous remplacez l'alimentation d'un actionneur déjà alimenté, une confirmation demande **Remplacer** ou **Annuler**.

### Nouveau capteur

Titre **Nouveau capteur** ou **Modifier le capteur**.

| Champ | Rôle |
| --- | --- |
| **Nom**, **Type**, **Tags dans l'assemblage** | Comme ci-dessus. |
| **Liaison surveillée** | Liste des liaisons mobiles. |
| Schéma de l'interrupteur | Pour les capteurs de position : dessin coté de la plage, mis à jour pendant la saisie. Absent tant qu'un champ n'est pas un nombre. |
| Paramètres | Plage (bas et haut), position, hystérésis, résolution, **Normalement fermé**... selon le type, avec leur unité. |

### Création d'un objet de convoyage

Titre **Création : Bande** (ou **Guide**, **Émetteur**, **Absorbeur**, **Cellule de présence**), puis **Modification : ...** à la modification.

| Champ | Rôle |
| --- | --- |
| **Nom**, **Assemblage** | Nom et assemblage porteur. |
| **Type** | Cellule de présence seulement (**Cellule photoélectrique**). |
| **Corps suivi** | Corps que l'objet suit, ou **Aucun : repère de l'assemblage**. |
| **Placement (mm, degrés)** | **X**, **Y**, **Z**, **RX**, **RY**, **RZ**. |
| Bande | **Longueur**, **Largeur**, **Rayon du tambour** (mm), **Tambour (liaison pivot continu)**. Valeurs initiales : 1000, 300, 50. |
| Guide | **Dimension X**, **Y**, **Z** (mm). Valeurs initiales : 1000, 20, 60. |
| Émetteur | **Dimension X**, **Y**, **Z** (mm), **Masse** (kg), **Matériau** (**Carton**, **Plastique**, **Bois**, **Acier**, **Inox**, **Aluminium**, **Laiton**, **Cuivre**). Valeurs initiales : 200, 150, 100, 0,5 kg, carton. |
| Absorbeur | **Dimension X**, **Y**, **Z** (mm). Valeurs initiales : 200, 300, 100. |
| Cellule de présence | Les paramètres de son type (portée, retard, inversion...). |

## La section Positionnement et l'alignement

La section **Positionnement** apparaît pour un assemblage ou un corps. Les outils sont dans la barre de l'inspecteur (voir plus haut) ; le déplacement du manipulateur dans la vue 3D est décrit dans [Vues centrales](/reference/views#le-manipulateur-de-placement).

Quand un alignement est en cours (bouton **Aligner (A)** enfoncé), un bloc **Aligner « nom »** s'affiche sous les outils.

| Contrôle | Ce qu'il fait | Grisé quand |
| --- | --- | --- |
| **Alignement** (liste) | **Plan sur plan**, **Axe sur axe**, **Axe sur axe autour d'un pivot**. Change le nombre de pointages demandés. | Jamais |
| Liste des pointages | Une ligne par face à pointer (par exemple **Face plane de la pièce qui bouge**), avec l'état **à pointer**, **cliquez dans la vue 3D** ou la face choisie. Un pointage fait est un bouton : le cliquer le remplace par le prochain clic dans la vue 3D. | Sans objet |
| **Retourner** | Inverse le sens de l'alignement (plan sur plan). | Absent pour les types sans ce paramètre |
| **Décalage (mm)** | Distance entre les deux faces. Validé en le quittant ; **Entrée** valide puis applique si tout est pointé. | Absent selon le type |
| **Rotation (°)** | Rotation autour de l'axe. Même comportement. | Absent selon le type |
| **Créer ensuite une liaison fixe** | Crée une liaison fixe entre les deux assemblages après l'alignement. | Si l'assemblage est déjà lié (la note donne la liaison : **Déjà liée par « nom »**) |
| Note de l'horloge | **Simulation en marche : la cible peut bouger pendant l'alignement. Mettez-la en pause avant.** | Sans objet |
| **Recommencer** | Efface les pointages. | Jamais |
| **Aligner** | Applique l'alignement. | Un pointage manque, ou une requête est en cours |

Un pointage refusé affiche la raison dans la ligne de message (par exemple **Cette face n'est pas plane.**).

## La barre de transport

![La barre de transport : Pause, 1 pas, 10 pas, Remise à zéro, temps simulé et nombre de pas](/screenshots/fr/transport-bar.webp)

![La barre de transport avec le bouton Relâcher tout quand un tag est forcé](/screenshots/fr/release-all.webp)

Elle est en haut de la zone centrale et n'existe que pendant qu'un Pantin est ouvert. Le temps simulé avance par pas fixes de 1/120 s.

| Contrôle | Ce qu'il fait | Grisé quand |
| --- | --- | --- |
| **Pause** / **Reprendre** | Un seul bouton à bascule. Pendant la simulation, **Pause** fige le temps simulé ; en pause, **Reprendre** relance. Le libellé et l'icône disent l'action que le bouton fera. | L'état de l'horloge n'est pas encore connu |
| **1 pas** | Avance d'un pas de simulation. | La simulation tourne (disponible en pause seulement) |
| **10 pas** | Avance de dix pas. | La simulation tourne |
| **Remise à zéro** | Efface les produits, les commandes et les défauts. Les modifications non enregistrées et l'horloge restent. | L'état de l'horloge n'est pas encore connu |
| **Relâcher tout (n)** | Rend à l'automate les `n` tags forcés depuis le viewer. Le bouton est masqué tant qu'aucun tag n'est forcé. | Masqué sans tag forcé |
| Temps (`12,345 s`) | Temps simulé depuis la remise à zéro. Info-bulle **Temps simulé**. | Sans objet |
| Compteur (`n pas`) | Nombre de pas simulés. Info-bulle **Nombre de pas simulés**. | Sans objet |
| Avertissement (icône et texte) | **La simulation prend du retard sur le temps réel (n %)** : le cœur n'arrive pas à exécuter tous les pas dus. L'info-bulle précise que, une fois un automate connecté, ses temporisations suivent l'horloge réelle et pourraient expirer à tort. | Sans objet |

::: info Même chose que le menu
**Remise à zéro** existe aussi dans **Édition**, mais l'entrée de menu attend la fin d'une requête en cours ; le bouton de la barre n'attend pas. **Relâcher tous les tags forcés** est aussi dans **Édition**.
:::

La console prévient aussi quand la simulation est en pause alors qu'un pont automate est connecté : l'automate voit une machine figée.

### Le journal du pont automate

![La fenêtre Journal du pont automate : colonnes heure, source et niveau, avec une ligne d'avertissement teintée](/screenshots/fr/bridge-journal.webp)

Le bouton **Journal** de la carte ouvre une fenêtre **Journal du pont automate**. Elle montre la fin du fichier de journal du pont (voir [Le fichier de journal](#le-fichier-de-journal)) sous forme de colonnes (**Lignes du journal**), calées en bas. Tant qu'elle est ouverte, elle se met à jour à chaque nouvel état du pont.

Chaque entrée affiche : l'heure locale `HH:MM:SS.mmm` (la date complète est dans l'info-bulle) ; un badge de source, **Cœur** ou **Pont** ; un badge de niveau, **Info**, **Avert.** (fond ambre) ou **Erreur** (fond rouge) ; le message (le nom du logger Python n'est que dans l'info-bulle, l'horodatage propre au pont est masqué). Les lignes de suite d'une entrée (une trace d'erreur, par exemple) sont indentées sous elle. Les lignes d'avertissement et d'erreur sont teintées, avec une barre à gauche.

Trois bascules, groupe **Niveaux affichés**, filtrent par niveau : **Erreur**, **Avertissement**, **Info**, chacune avec son nombre d'entrées. Comme dans la console, le choix est conservé tant que la page reste ouverte. Quand aucune entrée ne correspond : **Aucune entrée pour les niveaux affichés.**

| Contrôle | Ce qu'il fait | Grisé quand |
| --- | --- | --- |
| **Copier** | Copie tout le fichier brut dans le presse-papiers, y compris les lignes anciennes non affichées ; le bouton dit **Copié**, ou **Copie impossible** si le navigateur refuse. | Jamais |
| **Télécharger** | Télécharge le fichier brut complet, nommé `<pantinId>-bridge.log`. | Jamais |
| **Fermer** | Ferme la fenêtre. <kbd>Échap</kbd> fait la même chose. | Jamais |

Messages de la fenêtre : **Lecture du journal…** pendant la lecture ; **Pas encore de journal : il se remplit dès que le pont démarre.** quand le fichier n'existe pas ; **Lecture du journal impossible : …** en cas d'erreur ; **n entrées plus anciennes ne sont pas affichées : téléchargez le journal pour les avoir.** quand le fichier est plus long que la fenêtre.

Ne confondez pas avec le volet **Journal du pont** du bloc d'échec, qui ne montre que les 20 dernières lignes de la sortie du pont, et seulement après un échec.

#### Le fichier de journal

Le cœur écrit un fichier par Pantin : `<dossier des Pantins>/.logs/<pantinId>/bridge.log` (option `--logs-dir` du cœur pour changer le dossier `.logs`). Au-delà de 1 Mo, il devient `bridge.log.1` (le précédent est remplacé) et un nouveau fichier commence. Ce dossier ne fait partie d'aucun Pantin : si le dossier des Pantins est un dépôt git, ajoutez `.logs/` à son `.gitignore` (le cœur n'écrit pas ce fichier).

Chaque ligne commence par l'heure UTC : `CORE INFO …` pour les événements du cœur (demande de démarrage, prêt, arrêt), `CORE ERROR …` pour un échec, `BRIDGE …` pour les lignes écrites par le pont. Le pont Modbus y note les connexions acceptées et fermées (avec la raison et le nombre de requêtes servies et refusées) et chaque requête refusée distincte, par exemple :

```text
Module m1 refused a request from 10.0.0.5: unit 2, function 6, address 0, quantity 1 -> GATEWAY_NO_RESPONSE (11); this module answers unit 1.
```

Seule la première requête refusée identique est notée par connexion ; le total est dans la ligne de fermeture. Le fichier lui-même est aussi servi par `GET /api/pantins/:pantinId/bridge/log` (avec `?download=1` pour le télécharger) et se lit sans le cœur avec la commande `pnpm pantin bridge-log` (voir [Connecter un automate](/guide/connect-a-plc#lire-le-journal-du-pont)). Un pont lancé hors de Pantin n'a pas de fichier.

## La console

La console est un panneau sous la zone centrale. Le compteur de la barre d'outils l'ouvre et la ferme, comme **F8**. Une poignée au-dessus d'elle permet de changer sa hauteur (**Redimensionner la console**) ; un double-clic sur la poignée rétablit la hauteur d'origine. La hauteur est gardée dans le navigateur.

| Contrôle | Ce qu'il fait | Grisé quand |
| --- | --- | --- |
| Titre **Console du Pantin** | Nom du panneau. | Sans objet |
| **Erreur** / **Avertissement** / **Info** (filtres) | Trois boutons à bascule : montrent ou cachent les lignes de ce niveau. Enfoncé = affiché. | Jamais |
| **Effacer** | Masque les lignes lues jusqu'ici, dans ce viewer seulement ; le cœur garde son historique. | Aucune ligne lue (des filtres qui masquent toutes les lignes ne la grisent pas) |
| **Fermer la console** (croix) | Ferme le panneau. | Jamais |
| Liste de lignes | Une ligne par événement : heure de simulation, niveau, source, texte, détail et compteur de répétitions. | Sans objet |

Une ligne dont la source existe encore est cliquable : un clic (ou **Entrée**) sélectionne la source (un préactionneur, une liaison...). Une source supprimée s'affiche **(supprimé)**. Quand rien n'est affiché, la liste dit **Rien à signaler pour ce Pantin.** ou **Aucune ligne pour les niveaux affichés.**

La console rapporte notamment : une écriture de l'automate ignorée sur un tag forcé, une erreur dans un pas de simulation, un diagnostic apparu ou résolu, un défaut injecté ou retiré, un document migré à l'ouverture, une pause ou une reprise, un émetteur bloqué, la limite de produits atteinte, les connexions et déconnexions de l'automate et du pont, et les lignes d'avertissement ou d'erreur du journal du pont, sous la forme `Pont automate : <message>` (les lignes d'information restent dans le fichier de journal).

## La fenêtre d'accueil

![La fenêtre d'accueil, onglet Accueil](/screenshots/fr/welcome.webp)

Elle s'affiche quand aucun Pantin n'est ouvert. C'est une fenêtre modale au-dessus de la vue 3D vide. **Échap** ou la croix **Fermer la fenêtre d'accueil** la masque ; **Fichier**, **Accueil** la rappelle. Deux onglets, avec les flèches gauche et droite pour passer de l'un à l'autre.

### Onglet Accueil

| Contrôle | Ce qu'il fait |
| --- | --- |
| **Pantin vide** | Ouvre un champ **Nom du nouveau Pantin**. **Entrée** ou le bouton **Créer** (coche) crée et ouvre le Pantin ; **Annuler** (croix) ou **Échap** referme le champ. |
| **Depuis un fichier 3D** | Ouvre le sélecteur de fichiers, crée un Pantin portant le nom du fichier, puis ouvre le [formulaire d'import](#le-formulaire-d-import). |
| **Récents** | Jusqu'à six cartes (nom, nombre de corps, date de modification), les plus récentes d'abord. Un clic ouvre le Pantin. Sans Pantin : **Aucun Pantin pour l'instant. Créez-en un ci-dessus.** |
| **Ressources** | Liens qui s'ouvrent dans un nouvel onglet : **Dépôt du projet**, **Guides**, **Décisions de conception**. |
| **Raccourcis clavier** | Rappel des raccourcis principaux. |

### Onglet Tous les Pantins

| Contrôle | Ce qu'il fait |
| --- | --- |
| **Filtrer par nom ou identifiant** | Champ de recherche, insensible à la casse. Vide : tout est gardé. |
| Liste **Liste des Pantins** | Une ligne par Pantin : nom, identifiant, nombre de corps et date. Un clic sélectionne ; un double-clic, **Entrée** ou le bouton **Ouvrir** ouvre. Les flèches, **Début** et **Fin** déplacent la sélection. |
| Textes vides | **Aucun Pantin. Créez-en un depuis l'onglet Accueil.** ; **Aucun Pantin ne correspond au filtre.** |

Les erreurs de la fenêtre (fichier non pris en charge, cœur injoignable...) s'affichent dans la ligne de message de la fenêtre.

::: warning Non vérifié
Le style exact des pastilles de couleur (pont, modules) est défini par la feuille de style ; cette page décrit ce que le texte et la structure disent, pas les teintes.
:::

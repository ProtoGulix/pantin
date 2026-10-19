# Raccourcis clavier et souris

Les gestes au clavier et à la souris, groupés par zone. Les entrées de menu sont dans [Menus](/reference/menus).

::: info Ctrl ou Cmd
Sur macOS, <kbd>Cmd</kbd> remplace <kbd>Ctrl</kbd> dans les raccourcis. Exceptions : la navigation de la caméra et le glisser du manipulateur n'acceptent que <kbd>Ctrl</kbd>.
:::

## Global (fenêtre entière)

Ces raccourcis sont ceux des menus. <kbd>Alt</kbd> en plus les désactive ; <kbd>Maj</kbd> est ignoré (<kbd>Maj</kbd>+<kbd>G</kbd> agit comme <kbd>G</kbd>).

| Geste | Effet | Condition |
|---|---|---|
| <kbd>Ctrl</kbd>+<kbd>S</kbd> | **Enregistrer** | Entrée de menu non grisée. |
| <kbd>Ctrl</kbd>+<kbd>1</kbd> à <kbd>Ctrl</kbd>+<kbd>7</kbd> | Vues **Face**, **Arrière**, **Gauche**, **Droite**, **Dessus**, **Dessous**, **Isométrique** | Pantin ouvert et vue 3D affichée. |
| <kbd>F2</kbd> | **Renommer** la sélection | Entrée de menu non grisée. |
| <kbd>Suppr</kbd> | **Supprimer** la sélection | Entrée de menu non grisée. |
| <kbd>G</kbd> | **Déplacer** (manipulateur de déplacement) | Un assemblage utilisable est sélectionné (ou un corps : la sélection passe alors à son assemblage). |
| <kbd>R</kbd> | **Tourner** (manipulateur de rotation) | Idem. |
| <kbd>L</kbd> | **Repère local de l'assemblage** | Idem. |
| <kbd>A</kbd> | **Aligner…** | Idem, ou alignement en cours. |
| <kbd>F</kbd> | **Tout cadrer** | Corps présents et vue 3D affichée. |
| <kbd>F4</kbd> | **Vue suivante de la zone du haut** (3D, Schéma, Liaisons, E/S, en sautant la vue de la zone du bas) | Pantin ouvert. |
| <kbd>F8</kbd> | **Console** | Pantin ouvert. |
| <kbd>Échap</kbd> | Termine l'outil de placement en cours (manipulateur, alignement, choix d'axe) | Voir la chaîne d'Échap ci-dessous. |
| <kbd>Espace</kbd> ou <kbd>Maj</kbd>+<kbd>Espace</kbd> | Ouvre la liste des vues standard à l'emplacement du pointeur | Voir « Vue 3D ». |

Dans un champ de saisie, ces raccourcis ne s'exécutent pas : les touches gardent leur sens normal. <kbd>Ctrl</kbd>+<kbd>S</kbd> et <kbd>Ctrl</kbd>+<kbd>1</kbd> à <kbd>7</kbd> restent interceptés, même grisés, pour que le navigateur n'enregistre pas la page ni ne change d'onglet.

Les raccourcis à touche simple (<kbd>F2</kbd>, <kbd>Suppr</kbd>, <kbd>G</kbd>...) cèdent la place à un composant qui a déjà traité la touche (arborescence, menus, schéma, console).

### Chaîne d'Échap

<kbd>Échap</kbd> agit sur le premier cas de cette liste :

1. un glisser du manipulateur : l'assemblage revient à sa position de départ ;
2. un câblage en cours dans le schéma : il est abandonné (l'outil de placement reste actif) ;
3. un champ de saisie : il restaure sa valeur ;
4. une question de confirmation : elle choisit l'annulation ;
5. un menu ou un menu contextuel : il se ferme ;
6. l'outil de placement actif (manipulateur, alignement, choix d'axe) : il se termine.

## Barre de menus

| Geste | Effet |
|---|---|
| Clic sur un titre de menu | Ouvre le menu, ou le ferme s'il est déjà ouvert. |
| Survol d'un autre titre, menu ouvert | Ouvre ce menu à la place. |
| Clic sur une entrée | Exécute l'entrée si elle n'est pas grisée ; le menu se ferme. |
| Clic ailleurs dans la fenêtre | Ferme le menu. |
| <kbd>→</kbd> / <kbd>←</kbd> sur la barre | Passe au menu suivant ou précédent, avec retour à la fin. Si un menu est ouvert, le voisin s'ouvre sur sa première entrée. |
| <kbd>↓</kbd> / <kbd>↑</kbd> | Sur un titre, ouvre le menu sur sa première entrée. Dans un menu, entrée suivante ou précédente, avec retour à la fin. |
| <kbd>Entrée</kbd> ou <kbd>Espace</kbd> | Sur un titre, ouvre le menu. Sur une entrée, l'exécute (sans effet si elle est grisée). |
| <kbd>Échap</kbd> | Ferme le menu et ramène le focus sur son titre. |
| <kbd>Tab</kbd> | La barre est un seul arrêt de tabulation : <kbd>Tab</kbd> revient au dernier menu où l'on était. |

## Arborescence

Les flèches agissent quand l'arborescence a le focus ; l'élément sélectionné suit le focus.

| Geste | Effet |
|---|---|
| <kbd>↓</kbd> / <kbd>↑</kbd> | Ligne suivante ou précédente (sans sélection : première ou dernière). |
| <kbd>Début</kbd> / <kbd>Fin</kbd> | Première ou dernière ligne. |
| <kbd>→</kbd> | Déplie la ligne ; si elle est déjà dépliée, passe à son premier enfant. |
| <kbd>←</kbd> | Replie la ligne ; si elle est déjà repliée, passe à son parent. |
| <kbd>Entrée</kbd> | Active la ligne : l'inspecteur s'ouvre sur elle, et une ligne dépliable bascule entre dépliée et repliée. |
| <kbd>F2</kbd> | Renomme la ligne (si elle est renommable). |
| <kbd>Menu</kbd> (touche contextuelle) | Ouvre le menu contextuel de la ligne. |
| Clic | Sélectionne la ligne (la sélection se fait dès l'appui). |
| <kbd>Ctrl</kbd>+clic (ou <kbd>Cmd</kbd>+clic) | Ajoute la ligne à la sélection, ou l'en retire. La dernière ligne sélectionnée ne se retire pas. Réservé aux lignes de corps et de groupe d'un même assemblage ; ailleurs, c'est un clic simple. |
| <kbd>Maj</kbd>+clic | Sélectionne la plage entre la première ligne sélectionnée et la ligne cliquée (mêmes lignes que ci-dessus). |
| <kbd>Maj</kbd>+<kbd>↓</kbd> / <kbd>Maj</kbd>+<kbd>↑</kbd> | Étend la sélection à la ligne suivante ou précédente, dans les mêmes limites. |
| Clic sur le chevron | Déplie ou replie la ligne. |
| Clic sur l'oeil | Masque ou affiche l'assemblage dans la vue 3D. |
| Clic sur l'icône d'actionneur d'une liaison | Ouvre le formulaire de son actionneur. |
| Clic sur l'icône de capteur d'une liaison | Ouvre le formulaire de son premier capteur. |
| Double-clic | Renomme la ligne si elle est renommable, sinon l'active comme <kbd>Entrée</kbd>. |
| Clic droit | Ouvre le menu contextuel de la ligne. |
| Glisser un corps sur un assemblage (ou sur un corps) | Déplace le corps dans cet assemblage. Seules les lignes de corps se glissent. |
| Pendant un renommage : <kbd>Entrée</kbd> | Valide, et le focus revient à l'arborescence. |
| Pendant un renommage : <kbd>Échap</kbd> | Annule et restaure le nom. |
| Pendant un renommage : clic ailleurs | Valide le nom. |

### Menu contextuel (arborescence, vues standard, ports du schéma)

Ces trois listes se commandent de la même façon.

| Geste | Effet |
|---|---|
| <kbd>↓</kbd> / <kbd>↑</kbd> | Entrée suivante ou précédente, avec retour à la fin. |
| <kbd>Échap</kbd> | Ferme le menu. |
| Clic sur une entrée | L'exécute. |
| Clic ailleurs | Ferme le menu. |

Ouvert au clavier, le menu de l'arborescence a le focus sur sa première entrée. Le menu du schéma se ferme aussi avec <kbd>Tab</kbd>.

## Vue 3D et navigation de la caméra

### Souris

Le bouton gauche ne pilote pas la caméra : un clic sélectionne, glisser dans le vide ne fait rien. Le menu **Affichage** choisit la configuration.

| Geste | Souris : SolidWorks | Souris : ZW3D |
|---|---|---|
| Bouton du milieu, glisser | Tourne la caméra | Déplace la vue (panoramique) |
| <kbd>Ctrl</kbd> + bouton du milieu, glisser | Déplace la vue | Déplace la vue |
| <kbd>Maj</kbd> + bouton du milieu, glisser | Zoom (haut-bas) autour du point visé | Déplace la vue |
| Bouton droit, glisser | Aucun effet de caméra | Tourne la caméra |
| Molette | Zoom autour du curseur | Zoom autour du curseur |

- Avec **Souris : ZW3D**, seuls le bouton du milieu seul et le bouton droit comptent ; les touches <kbd>Ctrl</kbd> et <kbd>Maj</kbd> ne changent rien.
- Avec **Souris : SolidWorks**, pousser la molette vers l'avant dézoome ; avec **Souris : ZW3D**, c'est l'inverse. **Inverser le sens de la molette** (menu **Affichage**) retourne le sens dans les deux cas.
- Le menu contextuel du navigateur est supprimé sur la vue 3D : le bouton droit sert à la caméra.
- La rotation se fait autour du point du corps sous le curseur, s'il y en a un.
- Un appui sur la vue interrompt une animation de vue en cours.

### Sélection

| Geste | Effet |
|---|---|
| Clic sur un corps | Sélectionne l'élément correspondant dans l'arborescence. |
| Double-clic sur un corps | Descend d'un niveau : le clic sélectionne l'assemblage de plus haut niveau du corps, chaque double-clic sélectionne l'assemblage du niveau en dessous, jusqu'au corps lui-même. Un corps sans assemblage est sélectionné directement. Si un assemblage parent du corps est déjà sélectionné, un simple clic le garde. |
| Clic sur une bande, un guide, un émetteur, un absorbeur ou un capteur de présence | Sélectionne cet élément. |
| Clic dans le vide | Désélectionne, sauf si un outil de placement est actif. |
| Pendant l'alignement | Un clic choisit un corps pour l'alignement (un double-clic compte pour un seul choix). |

### Clavier (la vue 3D a le focus)

Les flèches pilotent la caméra quand la vue 3D a le focus (un clic dessus le lui donne).

| Geste | Effet |
|---|---|
| <kbd>←</kbd> / <kbd>→</kbd> | Tourne la vue autour de l'axe vertical, du pas choisi (**Pas des flèches** : 5°, 15° ou 45°). |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Tourne la vue vers le haut ou le bas, du même pas. |
| <kbd>Maj</kbd> + flèche | Tourne d'un quart de tour (90°). |
| <kbd>Ctrl</kbd> + flèche | Déplace la vue (panoramique) d'une fraction de la hauteur visible. |
| <kbd>Espace</kbd> ou <kbd>Maj</kbd>+<kbd>Espace</kbd> | Ouvre la liste des vues standard au pointeur (**Face** ... **Isométrique**). N'agit que si rien de particulier n'a le focus (page ou vue 3D), sans <kbd>Ctrl</kbd>, <kbd>Alt</kbd> ni <kbd>Cmd</kbd>, hors champ de saisie, avec un Pantin ouvert et la vue 3D affichée. |
| <kbd>↓</kbd> / <kbd>↑</kbd>, <kbd>Échap</kbd> dans cette liste | Entrée suivante ou précédente ; fermeture. |

<kbd>Alt</kbd> et <kbd>Cmd</kbd> désactivent ces flèches.

### Cube des vues

| Geste | Effet |
|---|---|
| Clic sur une face, une arête ou un coin du cube | Tourne la caméra vers cette direction ; le focus revient sur la vue 3D. |
| Survol d'une cellule | Éclaire toutes les cellules qui demandent la même vue. |

## Manipulateur de placement

Le manipulateur (flèches et arcs sur l'assemblage) s'active avec <kbd>G</kbd> (déplacer) ou <kbd>R</kbd> (tourner).

| Geste | Effet |
|---|---|
| Glisser une flèche ou un arc | Déplace ou tourne l'assemblage. Le déplacement est arrondi à un pas de 1 mm, la rotation à 15°, par défaut. |
| <kbd>Ctrl</kbd> maintenu pendant le glisser | Désactive l'arrondi : la valeur suit le pointeur. |
| <kbd>Échap</kbd> pendant le glisser | Annule : l'assemblage revient à sa position de départ. |
| <kbd>Échap</kbd> hors glisser | Termine l'outil (voir la chaîne d'Échap). |

## Schéma des chaînes

Le schéma se parcourt entièrement au clavier : un seul élément est un arrêt de tabulation, les flèches déplacent le focus. Ces touches n'agissent que sans <kbd>Ctrl</kbd>, <kbd>Alt</kbd> ni <kbd>Cmd</kbd>.

| Geste | Effet |
|---|---|
| <kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd> | Passe au voisin dans cette direction. |
| <kbd>Début</kbd> / <kbd>Fin</kbd> | Premier ou dernier noeud. |
| <kbd>Entrée</kbd> sur un noeud | Entre dans ses connecteurs (premier port). |
| <kbd>Entrée</kbd> sur un port de puissance | Ouvre **Relier à…** (menu des cibles possibles ; **Entrée** relie, **Échap** referme). |
| <kbd>Entrée</kbd> sur une commande numérique | Ouvre le petit champ de saisie d'une valeur à forcer. |
| <kbd>Espace</kbd> sur un noeud | Sélectionne le noeud. |
| <kbd>Espace</kbd> sur une commande booléenne | La bascule (force le tag). |
| <kbd>Échap</kbd> | Retire la sélection d'un lien ; sur un port, remonte au noeud. |
| <kbd>Suppr</kbd> | Retire le lien du port qui a le focus, ou le lien sélectionné ; s'il y a plusieurs liens, un menu propose lequel retirer. Ne supprime jamais un élément (voir **Édition** puis **Supprimer**) : un message le rappelle. |
| <kbd>F2</kbd> sur un noeud d'élément | Renomme cet élément (préactionneur, actionneur, capteur). |
| <kbd>Menu</kbd> (touche contextuelle) sur un port de puissance | Ouvre **Relier à…**. |
| <kbd>Menu</kbd> sur la commande d'un tag forcé | Ouvre un menu à une entrée qui relâche le tag. |
| Clic sur un noeud | Sélectionne le noeud. |
| Clic sur une commande booléenne | La bascule. |
| Clic sur une commande numérique | Ouvre le champ de saisie. |
| Clic sur un lien | Sélectionne le lien. |
| Clic sur l'en-tête d'une bande (chevron et nom de l'assemblage) | Replie ou déplie la bande ; <kbd>Entrée</kbd> ou <kbd>Espace</kbd> font de même au clavier. |
| Glisser de l'extrémité source d'un lien vers une cible | Crée le lien. Les cibles possibles s'éclairent, les autres s'estompent. Un appui qui bouge de moins de 4 pixels reste un clic. |
| <kbd>Échap</kbd> pendant le glisser | Abandonne le câblage. |

Dans le schéma, <kbd>Suppr</kbd> et <kbd>F2</kbd> n'agissent jamais sur la sélection de la fenêtre : <kbd>Suppr</kbd> affiche un message d'aide, <kbd>F2</kbd> est ignoré.

### Champ de valeur d'une commande numérique

| Geste | Effet |
|---|---|
| <kbd>Entrée</kbd> | Envoie la valeur (une virgule décimale est acceptée). Une valeur invalide garde le champ ouvert, marqué invalide. |
| <kbd>Échap</kbd> | Ferme sans écrire ; le focus revient sur le port. |
| Quitter le champ | Ferme sans écrire. |
| Défilement du schéma | Ferme le champ. |

Dans ce champ, les touches ne sont pas des raccourcis de la fenêtre ni du schéma.

## Vue Liaisons

La vue se parcourt entièrement au clavier : un seul élément est un arrêt de tabulation, les flèches déplacent le focus d'un noeud à l'autre. Ces touches n'agissent que sans <kbd>Ctrl</kbd>, <kbd>Alt</kbd> ni <kbd>Cmd</kbd>.

| Geste | Effet |
|---|---|
| <kbd>←</kbd> | Va au parent (vers le Monde). |
| <kbd>→</kbd> | Va au premier enfant. |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Va au frère précédent ou suivant. |
| <kbd>Espace</kbd> sur un noeud | Sélectionne le noeud. |
| <kbd>Entrée</kbd> sur un noeud | Le cadre dans la vue 3D quand elle est affichée ; sinon, le sélectionne seulement. |
| <kbd>J</kbd> | Sélectionne la liaison au-dessus du noeud (celle qui le relie à son parent). |
| <kbd>+</kbd> / <kbd>−</kbd> | Déplie ou replie les corps qui suivent le groupe. |
| <kbd>Menu</kbd> (touche contextuelle) ou <kbd>Maj</kbd>+<kbd>F10</kbd> | Ouvre le menu contextuel de l'arborescence pour ce noeud. |
| Clic sur un noeud ou une liaison | Le sélectionne. |
| Clic droit | Ouvre le menu contextuel de l'arborescence. |
| Double-clic | Cadre dans la vue 3D quand elle est affichée ; sinon, sélectionne seulement. |
| Molette | Zoome autour du pointeur. |
| Glisser le fond | Déplace la vue. |
| Clic sur **▸** | Déplie ou replie les corps qui suivent un groupe. |

<kbd>Suppr</kbd> et <kbd>F2</kbd> agissent sur la sélection de la fenêtre (**Supprimer**, **Renommer**) quand le focus est sur le noeud sélectionné ; sur un autre noeud, elles sont ignorées, pour ne pas toucher à autre chose que ce que le focus désigne.

## Champs de saisie

| Geste | Effet |
|---|---|
| <kbd>Entrée</kbd> dans un champ de renommage ou d'édition | Valide. Le champ perd le focus (qui revient à l'arborescence pour un renommage). |
| <kbd>Échap</kbd> | Restaure la valeur d'origine et quitte le champ. |
| Quitter le champ | Valide (sauf dans les formulaires de création, où quitter ne crée rien). |
| <kbd>Entrée</kbd> dans un champ de valeur d'un tag de l'inspecteur | Envoie la valeur. |
| <kbd>Entrée</kbd> / <kbd>Échap</kbd> dans un champ du formulaire de liaison | Valide / annule le formulaire. |

Pendant la saisie, les raccourcis de la fenêtre ne se déclenchent pas.

## Séparateurs

Quatre séparateurs redimensionnent la fenêtre : entre la colonne de gauche et la zone centrale, entre la zone centrale et l'inspecteur, au bord haut de la console, et, quand la zone du bas est ouverte, entre la zone du haut et la zone du bas.

| Geste | Effet |
|---|---|
| Glisser | Redimensionne ; la taille est mémorisée par le navigateur. |
| <kbd>←</kbd> / <kbd>→</kbd> (séparateurs verticaux) | Déplace de 16 pixels. |
| <kbd>↑</kbd> / <kbd>↓</kbd> (séparateur de la console) | Déplace de 16 pixels : <kbd>↑</kbd> remonte le bord, donc agrandit la console. |
| <kbd>↑</kbd> / <kbd>↓</kbd> (séparateur horizontal entre les deux zones) | Déplace de 16 pixels. |
| Double-clic | Revient à la taille par défaut. |
| Focus | Chaque séparateur est un arrêt de tabulation (il a le focus au clavier). |

## Console

Les lignes forment une liste : un seul arrêt de tabulation, sur la dernière ligne où l'on était (sinon la plus récente).

| Geste | Effet |
|---|---|
| <kbd>↓</kbd> / <kbd>↑</kbd> | Ligne suivante ou précédente. |
| <kbd>Début</kbd> / <kbd>Fin</kbd> | Première ou dernière ligne. |
| <kbd>Entrée</kbd> | Sélectionne la source du message (si la ligne en a une). |
| Clic sur une ligne | Idem. |
| Clic sur un filtre de niveau | Affiche ou masque ce niveau. |
| Clic sur le bouton d'effacement | Masque les lignes lues jusqu'ici dans ce viewer ; le cœur les garde (grisé s'il n'y a rien à effacer). |
| Clic sur la croix | Ferme la console. |

Dans la console, <kbd>F2</kbd> et <kbd>Suppr</kbd> ne déclenchent pas les raccourcis de la fenêtre (ils agiraient sur la sélection, pas sur la ligne).

## Question de confirmation

| Geste | Effet |
|---|---|
| Apparition de la question | Le focus va sur le bouton principal : <kbd>Entrée</kbd> le choisit. |
| <kbd>Échap</kbd> | Choisit l'annulation (les choix qui annulent). Sans effet si la question est désactivée par un traitement en cours. |

## Fenêtre d'accueil

La fenêtre est modale : le focus reste dedans.

| Geste | Effet |
|---|---|
| <kbd>Échap</kbd> | Ferme la fenêtre. |
| <kbd>Tab</kbd> / <kbd>Maj</kbd>+<kbd>Tab</kbd> | Passe au contrôle suivant ou précédent, avec retour à la fin. |
| <kbd>←</kbd> / <kbd>→</kbd> sur un onglet | Passe à l'autre onglet (**Accueil** / **Tous les Pantins**). |
| <kbd>Début</kbd> / <kbd>Fin</kbd> sur un onglet | Premier onglet (**Accueil**) / dernier onglet (**Tous les Pantins**). |
| <kbd>↓</kbd> dans le champ de filtre | Met le focus sur la liste. |

### Liste des Pantins (onglet Tous les Pantins)

| Geste | Effet |
|---|---|
| <kbd>↓</kbd> / <kbd>↑</kbd> | Ligne suivante ou précédente (sans sélection : première ou dernière). |
| <kbd>Début</kbd> / <kbd>Fin</kbd> | Première ou dernière ligne. |
| <kbd>Entrée</kbd> | Ouvre le Pantin sélectionné. |
| Clic | Sélectionne la ligne (dès l'appui). |
| Double-clic | Ouvre le Pantin. |
| Clic sur le bouton d'ouverture de la ligne | Ouvre le Pantin. |

## Autres champs

| Geste | Effet |
|---|---|
| Curseur d'une liaison (inspecteur) | Un glisser envoie la position à la liaison ; pendant le glisser, le flux de la simulation ne ramène pas le curseur en arrière. |
| Clic sur une case ou un bouton à bascule d'une ligne de l'inspecteur | Force le bit ou bascule le défaut. |

::: warning Limites connues
Le sens de la molette du préréglage **Souris : ZW3D** est celui de Babylon.js, il n'a pas été comparé au logiciel d'origine. Les touches propres aux formulaires d'actionneur, de capteur, de bande, de module d'E/S et du pont ne sont pas toutes listées ici.
:::

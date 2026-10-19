# Tutoriel : modéliser un vérin

Ce tutoriel construit, pas à pas dans le viewer, la machine de l'exemple
[`examples/plc-cylinder`](https://github.com/ProtoGulix/pantin/blob/develop/examples/plc-cylinder/README.md) :
un vérin double effet de 125 mm de course, alimenté par un distributeur 5/2
bistable, avec deux détecteurs de fin de course. À la fin, un automate peut le
piloter en Modbus TCP.

Les notions utilisées (Pantin, assemblage, corps, liaison, préactionneur,
actionneur, capteur, tag) sont expliquées dans
[les notions de base](/guide/fundamentals) et [le modèle](/guide/model). Lisez-les
d'abord si ces mots sont nouveaux.

::: tip Pour comparer
Le dossier `examples/plc-cylinder` contient une machine voisine, organisée
autrement : une liaison fixe interne `ecrou`, la glissière `verin` à l'intérieur
de l'assemblage `verin1`, et des tags en `verin1.*`. Un Pantin construit avec ce
tutoriel a des tags légèrement différents (voir l'étape 4). Copiez l'exemple
dans le dossier des Pantins du cœur pour l'ouvrir et comparer la machine, pas
les noms de tags.
:::

## Ce qu'il vous faut

- Le cœur et le viewer lancés avec `pnpm serve` (depuis un clone du dépôt, après
  `pnpm setup:python`). Cette commande active l'import STEP et le pont automate.
  Le viewer est alors à l'adresse `http://127.0.0.1:4800`.
- Un fichier de vérin au format STEP, GLB ou STL. L'exemple utilise le fichier
  constructeur `ID1S0400125E`, un STEP de trois composants : le corps, la tige
  et le chariot. Ce fichier d'origine n'est pas dans le dépôt, seuls ses trois
  maillages GLB y sont. Avec votre propre fichier, les noms et les valeurs
  changent, la démarche reste la même.

::: warning Import STEP
Sans `--step-converter-python`, le cœur refuse le STEP avec le message
« Import STEP indisponible ». Dans ce cas, exportez la pièce en GLB ou en STL.
Voir [Dépannage](/guide/troubleshooting).
:::

Dans ce tutoriel, les noms en **gras** sont les libellés exacts du viewer en
français.

## 1. Créer un Pantin

![La fenêtre d'accueil, onglet Accueil](/screenshots/fr/welcome.webp)

1. Ouvrez le viewer. La fenêtre **Bienvenue — Pantin** s'affiche. Sinon, ouvrez
   le menu **Fichier**, puis **Accueil**.
2. Dans l'onglet **Accueil**, sous **Nouveau**, cliquez la tuile **Pantin vide**.
3. Tapez un nom dans le champ **Nom du nouveau Pantin** (par exemple
   `plc-cylinder`), puis cliquez **Créer**.

Le Pantin est créé et ouvert. Il est vide : la vue 3D affiche un message
« Ouvrez un Pantin pour afficher ses corps en 3D » tant qu'il n'a aucun corps.

La tuile **Depuis un fichier 3D** crée le Pantin et importe le fichier en une
seule action. Le résultat est le même qu'aux étapes 1 et 2.

## 2. Importer le modèle 3D

![Le formulaire d'import sous la barre d'outils, avec la liste Axe vertical](/screenshots/fr/import-form.webp)

1. Dans la barre d'outils, cliquez le bouton d'import (infobulle **Importer un
   fichier 3D (GLB, STL, STEP) dans le Pantin ouvert**). Le menu
   **Fichier**, **Importer…** fait la même chose.
2. Choisissez votre fichier. Un petit formulaire apparaît sous la barre d'outils,
   avec le nom du fichier et son format.
3. Pour un STEP, comme ici, il n'y a rien à régler : l'unité est lue dans le
   fichier et l'axe Z est vers le haut. Pour les autres formats, le formulaire
   demande :
   - **Unité** (STL seulement) : `m (mètres)`, `mm (millimètres)`,
     `cm (centimètres)` ou `in (pouces)`, l'unité dans laquelle le fichier a
     été dessiné. Un GLB est en mètres.
   - **Axe vertical** (GLB et STL) : **Z vers le haut (CAO)** pour un fichier de
     CAO, **Y vers le haut (standard glTF)** pour un GLB venu de Blender.
4. Cliquez **Importer**.

Pour un STEP, le texte « Conversion STEP en cours… Jusqu'à 2 minutes ; gardez
cette page ouverte » s'affiche. La conversion se fait dans un processus séparé.

### Le découpage en corps

Le découpage est automatique, vous ne choisissez pas de nœuds :

- GLB et STL : un fichier donne un corps.
- STEP : un composant de l'assemblage donne un corps. Les corps sont rangés dans
  un assemblage, **sans aucune liaison** : un corps sans liaison parente bouge
  avec son assemblage (voir [Les concepts](/guide/model#les-concepts-corps-assemblage-groupe)).
  Un STEP qui contient des sous-assemblages nommés donne en plus une liaison fixe
  par sous-assemblage. Un message vous indique le nombre de corps importés.

Pour l'exemple, l'import crée trois corps (`ID1S0400125E_0_1`, `_0_2` et
`ID1S040CF-16040_3`) dans un seul assemblage, et aucune liaison.

::: tip Choisir les corps
Le viewer ne permet pas de choisir quels nœuds du fichier deviennent des corps,
ni de fusionner ou de scinder des corps. Un fichier GLB reste un seul corps. Pour
regrouper des corps qui bougent ensemble, utilisez **Grouper…** (étape 4).
:::

Le panneau de gauche affiche l'arborescence : le Pantin, son assemblage et ses
corps. Cliquez un corps pour le sélectionner et voir ses
propriétés dans l'inspecteur à droite.

## 3. Nommer l'assemblage et ses tags

Les tags de l'automate commencent par une clé d'assemblage, puis la clé de
l'élément : `verin1.verin1.coil_14` se lit « assemblage `verin1`, préactionneur
`verin1`, bobine 14 ».

1. Dans l'arborescence, sélectionnez l'assemblage créé par l'import.
2. Dans l'inspecteur, lisez le champ **Clé (préfixe des tags)**. Il se modifie
   comme les autres champs.
3. Mettez `verin1` pour retrouver les noms de l'exemple.

Changer le nom affiché (**Édition**, **Renommer**, ou F2) ne change pas la clé.
Les tags suivent la clé.

## 4. Grouper la tige et placer la liaison du vérin

Après l'import, aucune liaison n'existe : les trois corps suivent l'assemblage.
Pour que la tige glisse, il faut d'abord dire quels corps bougent ensemble : la
tige (`ID1S0400125E_0_2`) et le chariot (`ID1S040CF-16040_3`). Le corps du vérin
(`ID1S0400125E_0_1`) reste fixe. C'est le rôle d'un **groupe**.

### Grouper la tige et le chariot

1. Dans l'arborescence, dépliez l'assemblage et cliquez `ID1S0400125E_0_2`, puis
   <kbd>Ctrl</kbd>+clic sur `ID1S040CF-16040_3`.
2. Choisissez **Édition**, **Grouper…**.
3. La ligne « Grouper 2 éléments de l'assemblage « … » : quel nom donner au
   groupe ? » apparaît sous l'arborescence. Tapez `Tige` dans **Nom du groupe**,
   puis cliquez **Grouper**.
4. Le message « Groupe « Tige » créé. » s'affiche. Rien ne bouge : le groupe
   `Tige` est un sous-assemblage, relié à l'assemblage par une liaison **Fixe**
   nommée `Tige`.

La procédure complète, les refus possibles et **Dégrouper** sont dans
[Grouper, dégrouper, déplacer un corps](/guide/groups#faire-un-groupe).

### Transformer la liaison fixe en glissière

Le groupe est déjà relié à l'assemblage : il ne faut pas créer une seconde
liaison, mais **transformer** celle-là en **Glissière**.

1. Dans l'arborescence, faites un clic droit sur la liaison `Tige` (dossier
   **Liaisons entre assemblages**), puis choisissez **Changer le type…**.
2. Dans le formulaire **Modifier la liaison « … »**, choisissez **Glissière** dans
   **Type**, puis remplissez :

| Champ | Valeur pour l'exemple |
| --- | --- |
| **Nom** | `verin` |
| **Corps parent** | déjà rempli : l'assemblage du vérin (entrée **Groupe : …**). Ne le changez pas. |
| **Corps enfant** | déjà rempli : le groupe (entrée **Groupe : Tige**). Ne le changez pas. |
| **Origine** | 0, 0, 0 (en mm, dans le repère de l'assemblage) |
| **Axe** | X, avec **Sens inversé** : l'axe de l'exemple est (-1, 0, 0) |
| **Limites** : **basse** / **haute** | 0 et 125 (mm) |

3. Cliquez **Appliquer**. Modifier la liaison ne change pas sa clé de tag.
4. Dans l'arborescence, sélectionnez la liaison `verin`. Dans l'inspecteur, groupe
   **Général**, changez la **Clé de tag** (elle vaut `tige`, d'après le nom du
   groupe) en `verin`. Elle donne le milieu des tags de la liaison.

Quelques aides pour l'axe :

- **Prendre l'axe sur une face** : cliquez ensuite une face cylindrique dans la
  vue 3D. Échap annule.
- **Inverser l'axe** retourne le sens. La flèche dans la vue 3D montre le sens
  positif de la course : la tige doit sortir dans le sens positif.
- L'axe est exprimé dans le repère de l'assemblage du parent (le groupe lui-même quand le parent est un groupe), Z vers le haut.

Vérifiez le résultat avec le curseur **Position de « verin »** : faites-le
glisser, la tige **et** le chariot doivent se déplacer ensemble entre 0 et
125 mm sans sortir du corps.

Les tags de cette liaison commencent par la clé de l'assemblage qu'elle déplace,
ici le groupe : `tige.verin.setpoint` (tant qu'aucun actionneur ne la déplace) et
`tige.verin.position`. Ils ne commencent pas par `verin1`. Les capteurs de la
liaison (étape 8) sont rangés dans le même assemblage : `tige.verin-min.state` et
`tige.verin-max.state`. Le distributeur de l'étape 5 garde `verin1.verin1.coil_14`
et `verin1.verin1.coil_12`.

Pour créer une liaison entre deux éléments qui n'ont pas encore de parent, un
clic droit sur l'assemblage puis **Nouvelle liaison…** (ou **Édition**, **Nouvelle
liaison…**) ouvre le formulaire **Nouvelle liaison dans « … »**, avec les mêmes
champs. Si l'enfant a déjà un parent, le cœur refuse : « Body ... already
has the parent joint ... Delete that joint first ». Supprimez alors l'ancienne
liaison (clic droit, **Supprimer**).

Si la position du modèle n'est pas bonne, l'inspecteur propose des outils de
**Positionnement** : **Déplacer (G)**, **Tourner (R)** et **Aligner (A)**. Ils
sont hors du sujet de ce tutoriel.

## 5. Ajouter le préactionneur : le distributeur

![Le formulaire Nouveau préactionneur dans l'inspecteur](/screenshots/fr/form-new-drive.webp)

Le préactionneur est l'appareil que l'automate commande. Ici, c'est le
distributeur.

1. Dans l'inspecteur, cherchez la section **Préactionneurs**, ou le bouton
   **Nouveau préactionneur** (dans la barre d'outils de l'inspecteur, et dans le
   schéma, voir étape 7).
2. Remplissez le formulaire **Nouveau préactionneur** :
   - **Nom** : `verin1`.
   - **Type** : **Distributeur 5/2, bistable**.
   - **Tags dans l'assemblage** : l'assemblage `verin1`.
3. Validez.

Le distributeur porte deux tags de commande : **Bobine 14** (`coil_14`, pression
sur le fond du vérin, il sort) et **Bobine 12** (`coil_12`, pression côté tige,
il rentre). Ses sorties sont l'**Orifice 4** (`port_4`) et l'**Orifice 2**
(`port_2`).

Le distributeur a une mémoire : une impulsion sur une bobine place le tiroir, et
il y reste quand la bobine retombe. Si les deux bobines sont actives ensemble, le
tiroir garde sa position, sans diagnostic. Le diagnostic **Commandes
contradictoires** n'existe que pour les distributeurs 5/3 et le contacteur inverseur.

## 6. Ajouter l'actionneur : le vérin

![Le formulaire Nouvel actionneur dans l'inspecteur](/screenshots/fr/form-new-actuator.webp)

L'actionneur lit les sorties du préactionneur et déplace une liaison.

1. Cliquez **Nouvel actionneur** dans la barre d'outils de l'inspecteur. Le
   bouton est grisé tant qu'aucune glissière ou aucun pivot n'existe : le message
   « Créez d'abord une glissière ou un pivot » vous le rappelle. Un clic droit
   sur la liaison `verin`, puis **Ajouter un actionneur…**, ouvre le même
   formulaire avec la liaison déjà choisie.
2. Dans le formulaire **Nouvel actionneur** :
   - **Type** : **Vérin double effet**.
   - **Préactionneur qui l'alimente** : `verin1`, le distributeur de l'étape 5.
     **Aucun préactionneur ne convient à ce type** apparaît si aucun
     distributeur compatible n'existe.
   - **Liaisons qu'il déplace** : `verin`.
   - **Vitesse de sortie** et **Vitesse de rentrée** : l'exemple utilise
     0,05 m/s et 0,055 m/s, soit 50 et 55 mm/s.
3. Validez.

Le vérin a deux entrées : **Chambre fond (sortie)** et **Chambre tige (rentrée)**.
Dans l'exemple, la chambre fond est reliée à l'**Orifice 4** du distributeur et
la chambre tige à l'**Orifice 2**. Vérifiez-le dans le schéma (étape 7).

::: tip Unités
Pour une glissière, les champs de vitesse sont en mm/s : saisissez 50 et 55. Pour
un pivot, ils sont en degrés par seconde.
:::

## 7. Voir et relier la chaîne dans le schéma

![Le schéma des chaînes : distributeur, vérin, liaison et capteurs](/screenshots/fr/diagram.webp)

La zone centrale a une zone du haut et une zone du bas, chacune avec son
sélecteur de vue en haut à gauche (**3D**, **Schéma**, **Liaisons**, **E/S**).
Par défaut, la vue 3D est en haut et le schéma en bas. Si le schéma n'est pas
affiché, choisissez **Schéma** dans le sélecteur de la zone du bas (le bouton
**+** ouvre cette zone). La touche F4 passe la zone du haut à la vue suivante.

Le schéma montre quatre colonnes : **Préactionneurs**, **Actionneurs**,
**Liaisons** et **Capteurs**. Les boutons **Nouveau préactionneur**, **Nouvel
actionneur** et **Nouveau capteur** en tête de colonne sont les mêmes que ceux de
l'inspecteur.

- Pour **relier** deux éléments, glissez le lien d'un port de sortie vers un port
  d'entrée, ou utilisez **Relier à…** (Entrée sur un port de puissance, au
  clavier).
- Pour **retirer** un lien : sélectionnez-le, puis **Retirer ce lien** ou la
  touche Suppr.
- Le schéma refuse les liens impossibles et dit pourquoi, par exemple « La
  liaison verin est fixe : aucun actionneur ne peut la déplacer ».

Pour l'exemple, vous devez voir : distributeur `verin1`, orifice 4 vers la
chambre fond, orifice 2 vers la chambre tige, vérin vers la liaison `verin`.

## 8. Ajouter les capteurs de fin de course

Un capteur surveille toujours une liaison. Il en existe plusieurs types :
**Contact idéal**, **Fin de course mécanique**, **Détecteur inductif (axial)**,
**Détecteur de vérin (magnétique)**, **Codeur**.

### Les deux fins de course en un clic

1. Clic droit sur la liaison `verin`.
2. Choisissez **Ajouter les fins de course**.

Le viewer crée deux **Fin de course mécanique** nommées `verin min` et
`verin max`, déclenchées à 2 % de la course avant chaque butée (2,5 mm ici). Le
message « Fins de course « verin min » et « verin max » créées » s'affiche.

### Les capteurs de l'exemple

L'exemple utilise d'autres types : un **Détecteur inductif (axial)** `verin min`
côté rentré et un **Détecteur de vérin (magnétique)** `verin max` côté sorti. Pour
les reproduire :

1. Clic droit sur la liaison `verin`, puis **Ajouter un capteur…** (ou le bouton
   **Nouveau capteur** de l'inspecteur).
2. Dans **Nouveau capteur**, choisissez le **Type**, le **Nom** et la **Liaison
   surveillée** (`verin`), puis les paramètres que le formulaire propose pour ce
   type.
3. Validez.

Valeurs de l'exemple :

| Capteur | Type | Réglages |
| --- | --- | --- |
| `verin min` | inductif (axial) | face à 0 mm, distance nominale 5 mm, matériau acier, hystérésis 1 %, normalement ouvert |
| `verin max` | détecteur de vérin (magnétique) | position 125 mm, largeur de fenêtre 2 mm, hystérésis 1 mm, normalement ouvert |

Les libellés exacts des paramètres dépendent du type. Pour un capteur
d'un autre type, prenez ceux du formulaire. Un schéma coté du capteur et de sa
zone de détection s'affiche pour les fins de course.

Chaque capteur ajoute un tag de retour `state`, par exemple
`tige.verin-min.state`.

Pensez à enregistrer : **Fichier**, **Enregistrer** (Ctrl+S), ou le bouton
**Enregistrer** de la barre d'outils. Les modifications non enregistrées sont
signalées par **Modifications non sauvegardées**.

## 9. Tester sans automate

Le cœur simule en continu. Vous pouvez commander le distributeur à la main.

### Forcer une commande

![Une bobine forcée depuis le schéma, avec sa marque F](/screenshots/fr/forced-tag.webp)

1. Affichez le **Schéma** dans une des zones, ou sélectionnez le distributeur et
   regardez le groupe **Commandes** de l'inspecteur.
2. Dans le schéma, cliquez la commande **Bobine 14** : c'est un interrupteur
   (**Marche** / **Arrêt**). La tige sort en environ 2,5 s.
3. Cliquez **Bobine 12** pour la faire rentrer (environ 2,3 s).

Observez :

- la position dans le groupe **Position** ou **Retours** de l'inspecteur ;
- les capteurs : `state` passe à vrai près de chaque butée ;
- les bobines éteintes ne ramènent pas la tige : le distributeur a une mémoire.

::: warning Une écriture depuis le viewer force le tag
Toute commande écrite depuis le viewer **force** le tag : un badge **forcé**
apparaît et l'automate ne peut plus l'écrire, tant que vous ne l'avez pas
relâché. Utilisez **Relâcher** sur le tag, ou **Relâcher tout** dans la barre
de simulation (aussi dans **Édition**, **Relâcher tous les tags forcés**). Pensez
à tout relâcher avant de passer la main à l'automate.
:::

### Injecter un défaut

Dans l'inspecteur, groupe **Défauts**, vous pouvez activer **Ne répond plus** sur
le préactionneur, ou **Grippée** sur la liaison, pour voir ce que devient votre
programme.

### La barre de simulation

![La barre de transport : Pause, 1 pas, 10 pas, Remise à zéro, temps simulé et nombre de pas](/screenshots/fr/transport-bar.webp)

En haut de la zone centrale :

| Bouton | Effet |
| --- | --- |
| **Pause** / **Reprendre** | arrête ou relance le temps simulé |
| **1 pas** / **10 pas** | avance de 1 ou 10 pas, en pause seulement |
| **Remise à zéro** | efface produits, commandes et défauts |

Un pas dure 1/120 s. Le temps simulé s'affiche à côté. Si le cœur prend du retard,
un avertissement apparaît.

::: warning Pause et automate
Une simulation en pause alors qu'un automate est connecté lui montre une machine
figée. La console l'écrit : « Simulation en pause alors qu'un pont automate est
connecté ».
:::

## 10. Configurer les entrées et sorties

![La vue E/S avec le module m1, ses réglages et le tableau des voies](/screenshots/fr/io-view.webp)

L'automate ne voit pas les tags directement : il lit et écrit des coils et des
registres Modbus. La liste d'E/S (`io.json`) fait le lien. Elle est modifiée dans
le viewer, jamais à la main.

1. Au bas du panneau de gauche, trouvez le bloc **Pont automate**.
2. Cliquez **Config E/S**. La vue **E/S** s'affiche dans la zone du haut (si elle n'était déjà dans aucune zone).
3. Si le Pantin n'a pas de liste d'E/S, le message « Ce Pantin n'a pas encore de
   liste d'E/S (io.json) » apparaît avec le bouton **Créer le mapping**.
   Cliquez-le : il crée un premier module vide, `m1`, sur le port 1502.
   N'utilisez **Ajouter un module** (section **Modules**) que pour un module
   supplémentaire : il prend la clé et le port libres suivants (`m2`, 1503).
4. Section **Tags non affectés** : cliquez **Affecter tout** pour ranger tous
   les tags dans le module, ou **Affecter à m1** tag par tag.
5. Réglez, si besoin, **Réglages du module** : **Clé**, **Port**, **Adresse
   d'unité**, **Ordre des mots** (**Mot faible en premier** par défaut) et
   **Chien de garde (ms)**.
6. Enregistrez le Pantin (Ctrl+S).

Pour un Pantin construit avec ce tutoriel, le résultat doit ressembler à ceci :

| Tag | Zone | Adresse | Variable CODESYS |
| --- | --- | --- | --- |
| `verin1.verin1.coil_14` | coil | 0 | `verin1_verin1_coil_14` |
| `verin1.verin1.coil_12` | coil | 1 | `verin1_verin1_coil_12` |
| `tige.verin-min.state` | discrete input | 0 | `tige_verin_min_state` |
| `tige.verin-max.state` | discrete input | 1 | `tige_verin_max_state` |
| `tige.verin.position` | input register | 0 (REAL, 2 registres) | `tige_verin_position` |

Chaque ligne de **Voies** porte un **Tag**, une **Variable**, une **Zone**, une
**Adresse**, un **Type** et un **Commentaire**. Les problèmes (tag affecté deux
fois, adresses qui se chevauchent...) sont listés sous **Problèmes** ; cliquez
**Aller à la cellule concernée** pour les corriger.

Depuis un tag de l'inspecteur, **Affecter** range un tag sans quitter la vue
courante, et **Ouvrir dans E/S** le montre dans le module.

## 11. Générer la GVL CODESYS

La GVL est la liste de variables globales que vous collez dans le projet
CODESYS.

**Depuis le viewer**

1. Dans la vue **E/S**, cliquez **Exporter la GVL**.
2. Le navigateur télécharge un fichier texte. Il contient le mapping affiché,
   modifications non enregistrées comprises.

Le bouton est grisé, avec une infobulle, tant que le mapping est absent,
illisible ou invalide.

**Depuis la ligne de commande**

```sh
pnpm pantin gvl examples/plc-cylinder
```

La commande imprime la GVL sur la sortie standard. Elle refuse un mapping
invalide et énumère les problèmes. Pour un Pantin sans `io.json`, la ligne de
commande `pnpm pantin io init <dossier>` crée un mapping pré-rempli : le module
`m1`, sur le port 1502, avec tous les tags déjà affectés. **Créer le mapping**,
dans le viewer, crée `m1` vide ; **Affecter tout** fait ensuite le reste.

La GVL commence par un avertissement : l'automate testé ne doit jamais piloter de
sorties réelles en même temps. Elle ne contient pas d'adresses `AT` : c'est le
projet CODESYS qui relie les canaux Modbus à ces variables. La page
[Connecter un automate](/guide/connect-a-plc) explique la suite.

## 12. Démarrer le pont

![La carte Pont automate, pont en marche](/screenshots/fr/bridge-running.webp)

1. Enregistrez le Pantin et vérifiez, dans **Config E/S**, que le mapping n'a
   aucun problème.
2. Dans le bloc **Pont automate**, la pastille indique l'état (**Arrêté**). Le
   bouton rond de la ligne de titre est **Démarrer**.
3. Le réseau est **Local uniquement (127.0.0.1)** par défaut. Cliquez la pastille
   du réseau pour changer, voir [Connecter un automate](/guide/connect-a-plc).
4. Cliquez **Démarrer**. L'état passe à **Démarrage…** puis **En marche**.
5. Chaque module apparaît avec son adresse (`127.0.0.1:1502`) et son état :
   **en attente de l'automate**, puis **automate connecté** quand un client
   Modbus l'interroge.

Pendant que le pont tourne, toute modification des E/S l'arrête : le texte
« Toute modification des E/S arrête le pont » le rappelle. Relancez-le ensuite avec
**Redémarrer**.

Si le bloc affiche « Démarrez le cœur avec `--bridge-python <chemin>` », le cœur n'a
pas été lancé avec `pnpm serve`. Si le pont **En échec** s'affiche, le titre et le
journal du pont donnent la cause : voir [Dépannage](/guide/troubleshooting).

Pour tester la boucle sans CODESYS, n'importe quel client Modbus TCP convient :
écrivez le coil 0 de `127.0.0.1:1502`, unité 1, le vérin sort, puis lisez
l'entrée discrète 1.

## Ensuite

- [Connecter un automate](/guide/connect-a-plc) : réglages CODESYS, réseau local
  ou privé, sécurité.
- [Dépannage](/guide/troubleshooting) : les messages d'erreur et quoi faire.

::: warning Limites connues
- Les libellés et les messages de ce tutoriel viennent du code. Le nom exact de la liaison et la clé du groupe sont ceux que le viewer propose : lisez-les dans l'arborescence. Si un formulaire refuse, lisez le message du cœur : il dit quoi corriger.
- Un CODESYS Control Win V3 x64 a piloté cette scène (`plc-cylinder`) : voir le [réglage](/guide/connect-a-plc#configurer-l-automate-codesys). Les autres versions et les cibles WAGO n'ont pas été essayées.
:::

# Tags, défauts et liste d'E/S

Cette page décrit ce que l'automate voit : les tags, les défauts injectables et le fichier `io.json` qui les relie aux variables CODESYS et aux adresses Modbus.

Un tag porte un nom de la forme :

```
assemblage.clé.membre
```

Par exemple `pince.valve.coil_14`. La clé vient du nom de l'élément. Elle ne change que si vous la renommez vous-même : renommer un élément ne casse donc jamais le programme de l'automate.

Chaque tag a :

- un **type** : bit, entier ou flottant (un bit n'accepte que 0 ou 1) ;
- une **direction vue de l'automate** : **commande** (l'automate écrit) ou **retour** (l'automate lit). Un retour ne peut pas être écrit.

Dans l'inspecteur, les tags d'un élément sont groupés en **Commandes** et **Retours**. Une commande écrite prend effet au pas suivant (1/120 s).

## Lister les signaux

Un signal se décrit par son nom, son type, sa direction, son unité et l'élément auquel il appartient. La commande suivante lit le `pantin.json` enregistré, sans le cœur :

```
pnpm pantin signals examples/plc-cylinder
```

```
NAME                   TYPE   DIRECTION  UNIT   OWNER
tige.verin.position    float  feedback   metre  joint verin
verin1.verin1.coil_14  bit    command    none   drive verin1
verin1.verin1.coil_12  bit    command    none   drive verin1
tige.verin-min.state   bit    feedback   none   sensor verin min
tige.verin-max.state   bit    feedback   none   sensor verin max
```

`--json` affiche la même liste en JSON (`{ "signals": [...] }`). Le cœur la sert aussi, modifications non enregistrées comprises, par `GET /api/pantins/:pantinId/signals`.

L'unité est `metre`, `radian`, `metre_per_second`, `radian_per_second`, `percent`, `none` (bits, comptages) ou `unknown` (un variateur servo qui n'alimente encore aucun actionneur). Les valeurs restent en unités SI et ne sont jamais mises à l'échelle.

## Forcer et relâcher un tag

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

Affichez la vue **E/S** dans une zone (sélecteur de la zone, ou menu **Affichage**). Si le Pantin n'a pas encore de liste, **Créer le mapping**. Vous pouvez **Ajouter un module**, **Affecter** les **Tags non affectés** à un module, **Réaffecter** ou **Retirer** une voie. Les problèmes apparaissent dans **Problèmes**.

**Exporter la GVL** télécharge la liste de variables globales CODESYS correspondante. Si un tag est renommé, sa voie suit ; le nom de la variable ne change jamais.

La suite, pour brancher réellement l'automate, est dans [Connecter un automate](/guide/connect-a-plc).

Pour manipuler tout cela pas à pas, suivez le [Tutoriel](/guide/tutorial).

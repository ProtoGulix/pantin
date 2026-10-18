# Connecter un automate

Pantin se présente à l'automate comme des **modules d'E/S Modbus TCP** : le
simulateur est l'esclave, l'automate est le maître. Le programme de l'automate
garde sa configuration d'E/S habituelle et interroge les modules simulés comme il
interrogerait des modules réels (ADR 0003).

Cette page décrit le pont, le réglage réseau, la GVL et les précautions. Pour
construire la machine et sa liste d'E/S, suivez le [tutoriel](/guide/tutorial).

::: tip Vérifié avec un vrai CODESYS
Le pilotage de l'exemple `plc-cylinder` par un CODESYS Control Win V3 x64 réel a
été vérifié le 18 octobre 2026 (voir [Configurer l'automate](#configurer-l-automate-codesys)).
Les autres versions de CODESYS et les cibles WAGO ne sont pas vérifiées. La boucle
fermée automatique (`packages/bridge/tests/test_closed_loop.py`, lancée par
`pnpm check`) joue l'automate avec un client Modbus de test.
:::

## Comment ça marche

```text
automate (CODESYS)  <--Modbus TCP-->  pont (Python)  <--tag bus-->  cœur  <--REST/SSE-->  viewer
```

- Le **cœur** simule la machine et détient les tags.
- Le **pont** est un processus séparé. Il ouvre un esclave Modbus TCP **par
  module** de `io.json` et recopie les tags dans ses registres, et inversement
  (ADR 0045, 0048).
- Le cœur lance et arrête le pont à la demande, depuis le bloc **Pont
  automate** du viewer (ADR 0050). Il faut pour cela l'option
  `--bridge-python`, que `pnpm serve` fournit.

## Un module, un port

Chaque module de la liste d'E/S est un esclave Modbus indépendant, avec ses
propres réglages (ADR 0049) :

| Réglage | Défaut | Règle |
| --- | --- | --- |
| **Clé** | `m1`, `m2`... | unique |
| **Port** | 1502 et suivants | 1024 à 65535, unique ; jamais 502 par défaut |
| **Adresse d'unité** | 1 | 1 à 247 ; une requête pour une autre unité reçoit l'exception 11 |
| **Ordre des mots** | **Mot faible en premier** | pour les valeurs sur 32 bits |
| **Chien de garde (ms)** | 1000 | 100 à 3 600 000 |

Le port 502 demande des droits particuliers sur la plupart des systèmes : le
dépôt ne le choisit jamais seul (ADR 0046 point 9).

L'adresse IP n'est pas un réglage de module : tous les modules d'un pont
écoutent sur la même adresse, choisie au démarrage (voir plus bas). Pour
distinguer deux modules, l'automate utilise des **ports** différents.

## Fonctions et adresses

Le pont répond aux codes fonction 1 à 6, 15, 16 et 23. Tout autre code reçoit
l'exception 1, une adresse hors de la plage mappée l'exception 2, une quantité ou
un nombre d'octets incorrect l'exception 3.

| Zone | Direction vue de l'automate | Codes fonction | Types |
| --- | --- | --- | --- |
| `coil` | commande (sortie) | 1, 5, 15 | BOOL |
| `discrete_input` | retour (entrée) | 2 | BOOL |
| `holding_register` | commande analogique | 3, 6, 16, 23 | REAL, DINT |
| `input_register` | retour analogique | 4 | REAL, DINT |

- Les adresses sont numérotées **à partir de 0** (pas la notation « 40001 »).
- Un REAL (flottant IEEE 754 sur 32 bits) ou un DINT occupe **deux registres** :
  `adresse` et `adresse + 1`.
- Un tag de type bit devient un BOOL, un flottant un REAL, un entier toujours un
  DINT.
- Les valeurs sont en unités SI : mètres, radians, mètres par seconde.

::: warning Non vérifié
Avec l'exemple `plc-cylinder`, CODESYS a envoyé les fonctions 15, 02 et 04 et
l'ordre **Mot faible en premier** convenait. Pour d'autres canaux ou versions,
rien n'est vérifié : si une valeur flottante est fausse, essayez l'autre **Ordre
des mots** (ADR 0045 points 6 et 8).
:::

### Perte de l'automate : le chien de garde

Un module devient « connecté » à la première requête servie. Il redevient
« déconnecté » quand sa dernière connexion TCP se ferme, ou après la durée du
chien de garde sans aucune requête. Le cœur remet alors à 0 les **commandes
booléennes** mappées sur ce module. Les commandes flottantes et entières gardent
leur valeur. La console écrit « Automate déconnecté du module m1 » avec la raison.

## Configurer l'automate (CODESYS)

Ce réglage a été **vérifié le 18 octobre 2026** sur un CODESYS Control Win V3
x64 réel (IDE en interface française, version non relevée), avec l'exemple
`examples/plc-cylinder` : module `m1`, `192.168.1.161:1502`, unité 1. Les noms
de menus ci-dessous sont ceux de l'interface française, tels qu'ils s'affichent.

1. **Générez la GVL** et importez-la dans le projet CODESYS :
   - depuis le viewer : vue **E/S**, bouton **Exporter la GVL** ;
   - ou en ligne de commande : `pnpm pantin gvl <dossier du Pantin>`.

   La GVL est une `VAR_GLOBAL` avec une variable par voie, par exemple
   `verin1_verin1_coil_14 : BOOL;`, suivie en commentaire du module, de la zone,
   de l'adresse et du tag. Elle **n'a pas d'adresses `AT`** : c'est dans l'arbre
   des appareils CODESYS que vous reliez chaque canal Modbus à ces variables.
   Ne la modifiez pas : elle est régénérée.
2. **Ajoutez le maître et un serveur par module.** Dans l'arbre des appareils,
   sous **Device**, ajoutez **Ethernet**, puis **Modbus_TCP_Client** (le maître :
   l'automate), puis un **Modbus_TCP_Server** (un module Pantin) **par module**.
3. **Réglez le serveur**, onglet **Général** :
   - **Adresse IP** : l'adresse d'écoute du pont (une adresse comme 192.168.1.161 demande le mode **Réseau privé** du pont, voir [Réseau : local ou privé](#reseau-local-ou-prive)) ;
   - **Port** : le port du module (1502 a fonctionné) ;
   - **Unit-ID** : l'**Adresse d'unité** du module (1 pour `m1`).

   **Unit-ID vaut par défaut 16#FF (255).** Avec 255, le pont refuse chaque
   requête : le journal dit « refused a request ... : unit 255, function 16 ...
   -> GATEWAY_NO_RESPONSE (11); this module answers unit 1. »
4. **Créez les canaux**, onglet **Canal serveur Modbus**, bouton **Ajouter un
   canal** (voir l'[aide CODESYS](https://content.helpme-codesys.com/en/CODESYS%20Modbus/_mod_edt_slave_com_channel.html)).
   Règle : **un canal par zone utilisée**, avec pour décalage (offset) la plus
   petite adresse et pour longueur le nombre d'adresses, d'après le tableau
   d'adresses de la vue **E/S**. Ne configurez pas de canal sur une zone que le
   module n'a pas (par exemple **Read Holding Registers** sur `m1`) : le journal
   du pont montre une requête refusée.

   Pour `m1`, avec le déclenchement (Trigger) **CYCLIC** et 100 ms :

   | Canal | Fonction | Offset | Longueur |
   | --- | --- | --- | --- |
   | Commandes | Write Multiple Coils (15) | 0 | 2 |
   | Capteurs | Read Discrete Inputs (02) | 0 | 2 |
   | Position | Read Input Registers (04) | 0 | 2 |

   L'onglet **ModbusTCPServer Configuration** est une simple liste de
   paramètres en lecture seule.
5. **Reliez les canaux aux variables**, onglet **ModbusTCPServer Mappage E/S** :
   double-cliquez la colonne **Variable** d'une ligne, bouton « … », puis
   **Application**, **GVL**, la variable (icône « mapper sur la variable
   existante »).
   - Commandes `Bit0` → `verin1_verin1_coil_14`, `Bit1` → `verin1_verin1_coil_12` ;
   - Capteurs `Bit0` → `verin1_verin_min_state`, `Bit1` → `verin1_verin_max_state` ;
   - Position `[0]` et `[1]` (les lignes WORD, pas leurs bits) → deux variables
     WORD de **votre propre** GVL.

   Sans cette liaison, la colonne **Valeur actuelle** affiche « Pas actualisé
   (vérifier l'info-bulle) ».
6. En bas du même onglet, réglez **Toujours actualiser les variables** sur
   « Activé 2 (toujours dans la tâche du cycle de bus) ». La valeur par défaut
   (« Utiliser les paramètres de l'appareil parent ») n'actualise pas les
   variables non utilisées.

Le mappage et les options ne se modifient que **hors ligne** : si ces champs
sont grisés, faites **En ligne**, **Déconnexion**. C'est ce qui a été observé ;
la règle « se déconnecter pour modifier » vient de l'[aide CODESYS d'ABB](https://help.plc.abb.com/_cds_cmd_login.html).

### Un REAL sur deux registres

Dans ce montage, les lignes du canal sont des WORD : on n'a pas pu y relier directement un REAL. Le pont envoie le
**mot faible en premier**. Utilisez une UNION dans **votre** code (jamais dans
la GVL générée) :

```text
TYPE U_REAL_WORDS :
UNION
    r : REAL;
    w : ARRAY[0..1] OF WORD;
END_UNION
END_TYPE
```

Déclarez dans le programme (`VAR`) `conversion : U_REAL_WORDS;` et, dans **votre** GVL, `position_word_0 : WORD;` et `position_word_1 : WORD;` (les deux variables reliées aux lignes `Position[0]` et `Position[1]`). Puis, à chaque cycle :

```text
conversion.w[0] := position_word_0;
conversion.w[1] := position_word_1;
GVL.verin1_verin_position := conversion.r;
```

Sur le SoftPLC Windows (little-endian), `w[0]` est le mot faible. Les valeurs
sont en unités SI (mètres) : le vérin sorti a donné la position 0,125, soit les
mots `16#0000` et `16#3E00`.

La cible de test est **CODESYS Control Win V3** (le SoftPLC livré avec
l'IDE). Le mode Simulation de l'IDE coupe toute communication, il ne convient pas
(CLAUDE.md, section 10).

::: warning Non vérifié
Restent à vérifier : les autres versions de CODESYS et l'interface en anglais
(les libellés ci-dessus sont ceux de l'interface française), les noms de menus
sur les cibles WAGO, la reconnexion de CODESYS après une connexion refusée, et la
limite de 10 canaux signalée sur des forums.
:::

## Réseau : local ou privé

Dans le bloc **Pont automate**, cliquez la pastille du réseau (**Réseau :
local**) pour ouvrir le choix. Il y en a deux, et seulement deux (ADR 0004).

| Mode | Libellé | Effet |
| --- | --- | --- |
| Local | **Local uniquement (127.0.0.1)** | écoute sur 127.0.0.1 : l'automate tourne sur la même machine |
| Privé | **Réseau privé** | écoute sur **une** adresse privée de la machine, avec une liste de sources autorisées |

En **Réseau privé** :

- **Adresse d'écoute** : une liste propose 127.0.0.1 puis les adresses privées
  de la machine.
- **Automates autorisés (IP ou CIDR, séparés par des virgules)** : au moins une
  entrée (1 à 16), par exemple `192.168.56.10` ou `192.168.56.0/24`. Une entrée
  hors des plages privées est refusée, car aucune source ne pourrait y
  correspondre.
- Une adresse publique, générique (`0.0.0.0`, `::`), de lien local
  (`169.254.x.x`) ou un nom d'hôte est refusée.
- Toute connexion venue d'une source hors des plages privées ou hors de la liste
  est fermée **à l'acceptation, avant la lecture du premier octet**.
- Au plus 4 connexions par module.

Le choix du réseau n'est **pas enregistré** : chaque démarrage du cœur repart en
mode local. Pendant qu'il tourne, le cœur garde le dernier réseau en mémoire, et
**Redémarrer** le réutilise (ADR 0050 point 6). Les réglages sont verrouillés pendant que le pont tourne.

Le mode du pont est indépendant de celui du cœur : le cas attendu est un cœur
local, un viewer sur la même machine et un pont ouvert sur un réseau privé vers
une machine virtuelle CODESYS.

### Machine virtuelle : NAT ou pont

Si CODESYS tourne dans une machine virtuelle, le mode réseau de la machine
virtuelle change l'adresse source que Pantin voit :

- en **pont** (bridged), l'automate apparaît avec son adresse sur le réseau
  privé : mettez-la dans la liste des automates autorisés ;
- en **NAT**, la connexion peut arriver de l'hôte lui-même, par exemple
  `127.0.0.1` : aucune liste d'adresses ne distingue alors l'automate d'un autre
  programme local.

::: warning Non mesuré
Le comportement exact de CODESYS selon le mode réseau n'a pas été mesuré (spike
0004b en attente, ADR 0046). Les adresses de l'espace partagé `100.64.0.0/10`,
parfois utilisées par le NAT des machines virtuelles, sont **refusées** pour
l'instant (ADR 0004, points ouverts). Si votre automate n'est pas accepté,
ouvrez le **Journal** du pont : il y écrit une ligne « Module m1 refused a connection from » suivie de l'adresse, pour chaque connexion refusée.
:::

## Démarrer, arrêter, redémarrer

1. Enregistrez le Pantin ; son mapping doit être valide.
2. Dans le bloc **Pont automate**, cliquez **Démarrer**. L'état passe de
   **Démarrage…** à **En marche** quand tous les esclaves sont ouverts.
3. Chaque module s'affiche avec son adresse et son état : **en attente de
   l'automate**, **automate connecté** ou **pont arrêté**.
4. **Arrêter** coupe les esclaves. **Redémarrer** apparaît après un échec.

Autres règles :

- Le pont **ne se reconnecte pas** seul : si le lien avec le cœur se ferme ou si
  les E/S changent, il s'arrête et il faut le relancer. Le cœur ne le relance pas
  (ADR 0050).
- Toute modification de la liste d'E/S arrête le pont.
- Fermer le Pantin ne l'arrête pas : le viewer vous demande s'il faut l'arrêter
  aussi (**Arrêter le pont et fermer**, **Fermer sans arrêter le pont**).
- Un seul pont par Pantin. Un pont lancé à la main hors de Pantin et déjà
  connecté s'affiche : « Un pont lancé hors de Pantin est connecté. » ; arrêtez-le
  d'abord.

Sans le viewer, le pont se lance à la main (voir
[`packages/bridge/README.md`](https://github.com/ProtoGulix/pantin/blob/develop/packages/bridge/README.md)) :

```sh
.venv/bin/python -m pantin_bridge --core http://127.0.0.1:4800 \
  --pantin plc-cylinder --listen 127.0.0.1 --allow 127.0.0.1
```

## Lire le journal du pont

Quand l'automate se connecte mais que rien ne marche, le journal du pont dit ce que l'automate a demandé et pourquoi le pont l'a refusé.

- Dans le bloc **Pont automate**, cliquez **Journal** : la fenêtre **Journal du pont automate** s'ouvre et se met à jour toute seule, en colonnes (heure, source **Cœur** ou **Pont**, niveau), avec des bascules **Erreur**, **Avertissement** et **Info** pour filtrer. **Copier** et **Télécharger** servent à joindre le journal à une demande d'aide.
- Les lignes d'avertissement et d'erreur arrivent aussi dans la console : « Pont automate : … ».
- Sans le viewer, et même cœur arrêté : `pnpm pantin bridge-log <pantinId>`, avec `--logs-dir <dossier>` si le cœur a été lancé avec cette option, `--pantins-dir <dossier>` si les Pantins ne sont pas dans le dossier par défaut, et `--follow` pour suivre le fichier en direct.

Le fichier est `<dossier des Pantins>/.logs/<pantinId>/bridge.log` (détails dans [Panneaux et boutons](/reference/panels#le-journal-du-pont-automate)).

Exemple : l'automate se connecte, puis la connexion tombe au bout de quelques secondes (« no request for 5.0 s »). Le journal contient :

```text
Module m1 refused a request from 192.168.1.137: unit 255, function 16, address 0, quantity 1 -> GATEWAY_NO_RESPONSE (11); this module answers unit 1.
```

Le module répond à l'unité 1 (son **Adresse d'unité** dans `io.json`), l'automate interroge l'unité 255. C'est ce que fait le **Modbus_TCP_Server** de CODESYS tant que son **Unit-ID** garde la valeur par défaut 16#FF (255). Ici, le premier canal essayé était un Write Multiple Registers (16), dont ce module n'a pas besoin : seule l'unité compte dans cet exemple.

Réglez l'**Unit-ID** sur l'**Adresse d'unité** du module, puis chargez de nouveau le projet dans CODESYS. Le pont ne se redémarre que si vous changez l'**Adresse d'unité** dans `io.json`.

::: tip Vu avec CODESYS
Cette ligne a été obtenue avec un CODESYS Control Win V3 réel et l'**Unit-ID** par défaut, le 18 octobre 2026.
:::

## Tags forcés

Une commande écrite depuis le viewer **force** le tag : l'automate ne peut plus
l'écrire. La console l'écrit : « Écriture de l'automate ignorée sur le tag forcé
… ». Le bloc **Pont automate** affiche « N tag(s) forcé(s) : l'automate ne peut
pas les écrire » avec un bouton **Relâcher tout**.
Relâchez avant de passer la main à
l'automate. C'est la cause habituelle de « l'automate écrit mais rien ne bouge »
après un essai manuel depuis le viewer : **Relâcher** ou **Relâcher tout** rend la
main à l'automate.

## Sécurité

::: danger Modbus n'a aucune authentification
N'importe quel appareil autorisé par le filtre d'adresse peut écrire les commandes
et lire les retours. Le filtre d'adresse n'est pas une authentification : il ne
protège pas contre une adresse usurpée sur un réseau partagé, et il ne remplace
pas le pare-feu de la machine (ADR 0004, 0046).
:::

- **Ne branchez jamais un automate qui pilote des sorties réelles.** Un automate
  se fie aux retours de Pantin. Utilisez un SoftPLC, ou un automate dont les
  entrées-sorties terrain sont **débranchées** (ADR 0046 point 10). La GVL générée
  le rappelle dans son en-tête.
- Pantin n'atteint aucun actionneur réel : ses sorties ne déplacent que des
  liaisons simulées.
- Les services écoutent sur `127.0.0.1` par défaut. Ouvrir le réseau est un choix
  explicite, limité aux réseaux privés.
- Modbus ne passe jamais par un tunnel ou un proxy (Cloudflare, nginx) : le pont
  écoute sur l'adresse que vous choisissez, sur votre réseau. Une exposition par
  tunnel protégée par Cloudflare Access peut démarrer ou arrêter le pont, mais
  n'ouvre jamais le bus de tags (ADR 0046 point 7, ADR 0050).
- Avant tout usage sur un vrai réseau de production, la position de Pantin doit
  être réévaluée par une nouvelle décision (authentification, TLS, segmentation).

## Voir aussi

- [Tutoriel : modéliser un vérin](/guide/tutorial)
- [Dépannage](/guide/troubleshooting)
- [ADR 0045 : pont, mapping et esclave Modbus](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0045-plc-bridge-tag-bus-io-mapping-and-modbus-slave.md)
- [ADR 0046 : sécurité du pont](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0046-security-of-the-plc-bridge.md)
- [ADR 0004 : exposition réseau](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0004-network-exposure.md)

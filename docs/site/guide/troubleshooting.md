# Dépannage

Chaque entrée suit le même plan : ce que vous voyez, la cause, ce qu'il faut faire.
Les messages sont ceux que le viewer et le cœur affichent aujourd'hui. Les
messages du cœur et du pont sont en anglais, ceux du viewer en français.

Pour lire l'historique, ouvrez la **Console** (menu **Affichage**, **Console**, ou
F8). Elle garde les erreurs, avertissements et infos du Pantin ouvert, avec le
temps de simulation.

## Le viewer et le cœur

| Ce que vous voyez | Cause | Que faire |
| --- | --- | --- |
| « Impossible de joindre le cœur Pantin. Est-il lancé sur 127.0.0.1:4800 ? » | Le cœur n'est pas démarré, ou écoute ailleurs | Lancez `pnpm serve`. Avec `--port` ou `--listen`, ouvrez le viewer à l'adresse affichée au démarrage (« Pantin core (local mode) on http://... ») |
| Le cœur s'arrête au démarrage avec une erreur `EADDRINUSE` | Le port 4800 est déjà pris, par un autre cœur par exemple | Fermez l'autre programme, ou lancez le cœur avec `--port <autre numéro>` |
| Le cœur refuse de démarrer : `Refusing to listen on "…"` | L'adresse `--listen` est publique, générique (`0.0.0.0`, `::`), de lien local, ou un nom d'hôte | Utilisez `127.0.0.1` (défaut) ou **une** adresse privée de la machine, par exemple `192.168.1.20` (ADR 0004). `--allow` prend une IP ou un CIDR |
| `Invalid --allow "…"` | Une entrée n'est ni une IP ni un CIDR | Écrivez `192.168.1.10` ou `192.168.1.0/24` |
| `--bridge-python "…" is not a file` au démarrage | Le chemin donné n'existe pas | Créez l'environnement avec `pnpm setup:python`, puis relancez avec `pnpm serve` |
| Une ligne `Rejected connection from …` dans la sortie du cœur | Une source hors des plages privées, ou hors de la liste `--allow`, a été fermée à l'acceptation | Normal si la source est inconnue. Sinon, ajoutez son adresse à `--allow` |
| « La vue 3D ne peut pas démarrer : le navigateur refuse WebGL » | WebGL est désactivé | Activez l'accélération matérielle du navigateur, puis redémarrez-le. Les panneaux restent utilisables |
| « Le flux de poses s'est arrêté : le cœur l'a refusé ou ne répond plus » | Le flux de positions est fermé, par exemple parce que beaucoup d'onglets sont ouverts sur le même cœur | Fermez un onglet, puis rouvrez le Pantin |
| « Le flux de poses a envoyé des données non conformes au protocole » | Le flux ne respecte pas le protocole attendu, par exemple avec un viewer et un cœur de versions différentes (cause probable, non vérifiée) | Reconstruisez le viewer et relancez le cœur (`pnpm serve` fait les deux) |
| « Élément introuvable ; la liste a peut-être changé. Rechargez la page. » | Un élément a été supprimé entre-temps, par exemple depuis un autre onglet | Rechargez la page |
| « Conflit : la demande est incompatible avec l'état actuel du Pantin… » | Nom déjà pris, corps encore utilisé par une liaison, préactionneur encore utilisé par un actionneur | Lisez le message complet, puis détachez ou supprimez d'abord l'élément qui bloque |
| « Erreur interne du cœur ; consultez son journal. » | Une erreur inattendue dans le cœur | Regardez la sortie du terminal où tourne le cœur |
| « La simulation prend du retard sur le temps réel » | Le cœur n'exécute pas tous les pas dus | Sans automate, c'est un ralentissement. Avec un automate connecté, ses temporisations suivent l'horloge réelle : fermez les autres programmes lourds |

## Import de fichiers 3D

| Ce que vous voyez | Cause | Que faire |
| --- | --- | --- |
| « « fichier » n'est pas pris en charge. Choisissez un fichier .glb, .stl, .stp ou .step. » | Extension non reconnue | Exportez depuis votre CAO en GLB, STL ou STEP |
| « Fichier non pris en charge : utilisez un GLB, un STL ou un STEP valide. » | L'extension est bonne, le contenu non | Ouvrez le fichier dans votre CAO, réexportez-le |
| « Fichier trop volumineux pour l'import. » | Le fichier dépasse la limite du cœur | Simplifiez le modèle, ou exportez les composants séparément |
| « Import STEP indisponible : lancez le cœur avec --step-converter-python … » | Le cœur n'a pas été lancé avec le convertisseur (le démarrage affiche « STEP import disabled (no --step-converter-python) ») | Lancez `pnpm setup:python` puis `pnpm serve`. À défaut, exportez en GLB ou STL |
| « The STEP converter could not be started with "…". Check --step-converter-python. » | Le chemin de Python du convertisseur est faux, ou l'environnement est cassé | Relancez `pnpm setup:python`, puis le cœur avec le bon chemin |
| « Conversion STEP impossible : vérifiez que le fichier s'ouvre dans votre CAO, réexportez-le en STEP (AP214 ou AP242) ou exportez-le en GLB ou STL. » | La conversion a échoué ou dépassé ses limites (2 minutes, taille de sortie) | Réexportez en STEP AP214 ou AP242, simplifiez l'assemblage, ou exportez en GLB ou STL. Le détail est dans la sortie du cœur |
| « The assembly "…" is placed with a scale or a mirror, which Pantin cannot represent. Export the model without scaled or mirrored instances. » | Une instance d'assemblage du STEP est mise à l'échelle ou en miroir | Dans la CAO, remplacez l'instance en miroir par une vraie pièce symétrique, puis réexportez |
| Un message dans la console : « Pas de fichier de faces… » | Le corps n'a pas de table de faces | Le modèle s'affiche et s'anime normalement. Seul **Aligner** ne peut pas viser d'axe sur ce corps |
| « Impossible d'afficher le corps « … » » | Le maillage du corps ne se charge pas | Réimportez le fichier. Si le problème persiste, vérifiez qu'il s'ouvre dans votre CAO |

Pendant une conversion STEP, la page doit rester ouverte : « Conversion STEP en
cours… Jusqu'à 2 minutes ».

## Groupes et liaisons

Le cœur refuse sans rien changer, et le viewer affiche sa phrase telle quelle (en anglais). Le nom de la liaison ou du corps en cause y figure. Les cas sont expliqués dans [Faire un groupe](/guide/groups#faire-un-groupe) et [Défaire un groupe](/guide/groups#defaire-un-groupe).

| Ce que vous voyez | Cause | Que faire |
| --- | --- | --- |
| **Grouper…** ou **Dégrouper** est grisé | La sélection n'est pas faite de corps et de sous-groupes d'un même assemblage ; ou la ligne n'est pas un assemblage rangé dans un autre | Resélectionnez avec <kbd>Ctrl</kbd>+clic ou <kbd>Maj</kbd>+clic des lignes sous le même assemblage |
| `Joint "…" hangs body "…" from …, which moves inside "…" and is not part of the group…` | Un corps du groupe est suspendu à un corps mobile qui n'est pas dans le groupe | Ajoutez ce corps au groupe, ou supprimez la liaison |
| `Joint "…" links body "…", which is in the group, to body "…", which is not…` | Une liaison relie un corps du groupe à un corps resté dehors | Ajoutez le second corps au groupe, ou supprimez la liaison |
| `Group "…" is moved by joint "…" … its bodies would stop following it` (**Dégrouper**) | Une glissière ou un pivot déplace le groupe | Rendez cette liaison **Fixe** ou supprimez-la, puis dégroupez |
| Un refus qui nomme un préactionneur, un actionneur, un capteur ou une bande | La liaison à supprimer est utilisée par cet élément | Retirez d'abord l'élément |
| `Tag key "…" … is already used by …` | Deux clés de tag se heurteraient dans l'assemblage d'arrivée | Renommez l'une des clés (la phrase en propose une libre) |
| `Assembly "…" is at the top of the structure tree…` | **Dégrouper** sur un assemblage de premier niveau | Rien à faire : il n'y a pas où le verser |
| `Group "…" is not moved by any joint, but assembly "…" is moved by joint "…": its bodies would start following …` (**Dégrouper**) | Le groupe ne bouge pas, mais l'assemblage où il se dissoudrait est déplacé par une liaison : ses corps se mettraient à le suivre | Dégroupez quand cet assemblage ne bouge pas, ou tenez d'abord le groupe par une liaison fixe vers lui |
| `Group "…" hangs from … by joint "…", which moves inside "…": its bodies would stop following it` (**Dégrouper**) | Le groupe est suspendu à quelque chose qui bouge dans l'assemblage d'arrivée | Changez d'abord le parent de cette liaison |
| `Joint "…" (…) links … and moves. Delete it or make it a group joint first, then move the body.` | En déplaçant un corps vers un autre assemblage : une liaison mobile le relie à l'ancien assemblage | Supprimez-la, ou faites-en une liaison de groupe, puis déplacez le corps |
| `Body "…" would jump when the groups move: … Move it to an assembly that moves with "…".` | Le corps sauterait quand les groupes bougent : l'ancien et le nouvel assemblage ne sont pas déplacés par la même liaison | Déplacez-le vers un assemblage qui bouge avec l'ancien, ou déplacez le groupe entier |
| Refus au déplacement d'un corps vers un autre assemblage | Le corps et ses deux groupes ne sont pas déplacés par la même liaison | Déplacez le groupe entier, ou utilisez **Grouper…** |
| Liaison entre assemblages refusée : l'enfant est un corps | Entre deux assemblages, l'enfant doit être un groupe | Choisissez l'entrée **Groupe : nom** comme **Corps enfant** |
| Après **Grouper…**, le programme de l'automate ne trouve plus ses variables | Des tags ont été renommés (« régénérez la GVL de l'automate ») | **Exporter la GVL** à nouveau, puis recharger dans le programme |
| Un corps bouge maintenant avec son groupe, alors qu'il restait fixe | Pantin ancien (schéma 12) migré à l'ouverture : un corps sans liaison parente suit désormais son groupe. La **Console** liste ces corps (« Les corps sans liaison parente suivent maintenant leur groupe quand il bouge : … ») | Vérifiez la scène. Pour qu'il reste immobile, déplacez-le dans un assemblage qui ne bouge pas (voir [Déplacer un corps](/guide/groups#deplacer-un-corps-dans-un-autre-assemblage)), ou mettez-le à part dans un groupe (non vérifié dans le viewer) |

## Le pont automate

Le bloc **Pont automate**, en bas du panneau de gauche, montre l'état et, en cas
d'échec, un titre en gras, le message du pont et un **Journal du pont** (les
dernières lignes de sa sortie). Le bouton devient **Redémarrer**. Le pont ne
redémarre jamais seul.

### Le pont ne démarre pas

| Ce que vous voyez | Cause | Que faire |
| --- | --- | --- |
| Le bouton **Démarrer** est grisé, avec la ligne « Démarrez le cœur avec `--bridge-python <chemin>` (pnpm setup:python) » | Le cœur a été lancé sans `--bridge-python` (le démarrage affiche « PLC bridge disabled (no --bridge-python) ») | `pnpm setup:python`, puis `pnpm serve` |
| « Pont automate indisponible : démarrez le cœur avec --bridge-python… » | Même cause, à l'appui sur **Démarrer** | Idem |
| Un message d'erreur en cliquant **Démarrer**, avec les premiers problèmes du mapping | Le mapping est absent ou invalide (le cœur refuse avec une erreur de conflit) | Ouvrez **Config E/S**, corrigez les **Problèmes**, puis recommencez |
| **Démarrer** grisé et « Un pont lancé hors de Pantin est connecté. » | Un pont lancé à la main tient déjà la connexion de ce Pantin | Arrêtez ce pont (Ctrl-C dans son terminal) |
| « This Pantin's bridge is already running or starting. » | Un pont de ce Pantin tourne déjà | Utilisez **Arrêter** puis **Démarrer** |
| « Module m1 uses 127.0.0.1:4800, where the core itself listens. Change the module's port in io.json. » | Le port du module est celui du cœur | Changez le **Port** du module dans la vue E/S |
| « Module m1 uses … already held by the bridge of Pantin … » | Deux Pantins ont le même port sur la même adresse | Changez le **Port** d'un des modules |
| « The core already supervises 4 bridges. Stop one first. » | Quatre ponts tournent déjà | Arrêtez-en un |
| « "…" is not an address of this machine. Choose one of: … » | L'**Adresse d'écoute** n'est pas une adresse de la machine | Choisissez une adresse dans la liste |
| « A private-network listen address needs at least one allowed IP or CIDR. » | **Réseau privé** sans entrée dans **Automates autorisés** | Saisissez l'IP ou le CIDR de l'automate |
| « Allow entry "…" is outside the loopback and private ranges, so no source could match it. » | Une entrée de la liste est une adresse publique | N'utilisez que des adresses privées ou de bouclage |

### Le pont s'arrête en échec

Le titre vient du genre d'échec. Le texte détaillé est dans le message et dans le
journal.

| Titre affiché | Genre | Cause | Que faire |
| --- | --- | --- | --- |
| **Le pont refuse sa configuration** | `configuration` | Une adresse refusée par les règles de sécurité, ou un port **déjà pris** : « Module m1 cannot listen on …: the port is taken, or this user may not bind it. Change the module's port in io.json. » | Changez le **Port** du module (1024 ou plus), ou fermez le programme qui l'occupe |
| **Le pont ne joint pas le cœur** | `core_unavailable` | « Cannot reach the core at … Is it running? » | Vérifiez que le cœur tourne. Redémarrez le pont |
| **La liste d'E/S n'est pas valide** | `mapping_not_valid` | « The io mapping is invalid: … » | Corrigez les problèmes dans **Config E/S**, enregistrez, redémarrez |
| **Les E/S ont changé : redémarrez le pont** | `mapping_changed` | La liste de tags ou le mapping a changé pendant que le pont tournait (c'est un avertissement, pas une panne) | Cliquez **Redémarrer** |
| **Le pont a perdu la liaison avec le cœur** | `bus_closed` | Le cœur s'est arrêté ou la liaison est tombée | Relancez le cœur si besoin, puis **Redémarrer** |
| **Erreur de protocole entre le pont et le cœur** | `protocol` | Le pont et le cœur n'ont pas la même version de protocole, ou une réponse est trop grosse | Mettez à jour le dépôt et refaites `pnpm setup:python` |
| **Erreur inattendue du pont** | `unexpected` | Un bogue | Lisez le **Journal du pont** et la sortie du cœur (lignes `[bridge <Pantin>] …`) |
| **Le pont n'a pas pu être lancé** | `spawn_failed` | « Cannot run the bridge's Python (…). Run pnpm setup:python. » | `pnpm setup:python` |
| **Le pont n'a pas démarré à temps** | `start_timeout` | « The bridge did not report ready in time. See the bridge log. » (15 s) | Lisez le journal : un module n'a pas pu s'ouvrir, ou la machine est surchargée |
| **Le pont s'est arrêté brutalement** | `crashed` | Le pont s'est terminé sans dire pourquoi, avec le code ou le signal de sortie | Lisez le journal |

### Le pont tourne, mais l'automate ne voit rien

| Ce que vous voyez | Cause | Que faire |
| --- | --- | --- |
| Le module reste sur **en attente de l'automate** | Aucune requête n'est arrivée | Vérifiez l'adresse IP, le **Port** et l'**Adresse d'unité** du maître Modbus de l'automate |
| Le module reste en attente, avec l'automate sur une machine virtuelle | La source est refusée : en NAT, elle peut arriver de l'hôte, et l'espace `100.64.0.0/10` est refusé | Lisez le journal du pont (« Module m1 refused a connection from … »). Passez la machine virtuelle en réseau en pont, ou adaptez la liste des automates autorisés. Voir [Connecter un automate](/guide/connect-a-plc) |
| L'automate se connecte puis la connexion tombe ; le journal dit « no request for 5.0 s » | Le pont refuse les requêtes de l'automate (unité, fonction ou adresse inattendues) puis ferme la connexion inactive | Ouvrez **Journal** dans le bloc **Pont automate** et cherchez « refused a request » : il donne l'unité demandée et celle que le module attend. L'ID d'unité du maître CODESYS doit égaler l'**Adresse d'unité** du module. Voir [Connecter un automate](/guide/connect-a-plc#lire-le-journal-du-pont) |
| La console : « Automate déconnecté du module m1 (plus de réponse dans le délai) » | Aucune requête pendant la durée du **Chien de garde (ms)** | Augmentez le chien de garde, ou vérifiez que l'automate interroge bien le module. Les commandes booléennes sont remises à 0 |
| La console : « Automate déconnecté… (connexion fermée) » | L'automate a fermé sa connexion | Même chose : les commandes booléennes sont remises à 0 |
| La console : « Pont automate déconnecté… les commandes booléennes mappées sont remises à 0 » | Le pont s'est arrêté ou a perdu le cœur | Redémarrez le pont |
| Une valeur flottante (la position) est absurde | Mauvais **Ordre des mots** | Passez le module de **Mot faible en premier** à **Mot fort en premier**, ou l'inverse |
| Une exception Modbus 2 ou 3 côté automate | Adresse hors de la plage mappée, ou quantité fausse | Comparez les adresses du projet CODESYS avec la liste d'E/S |
| Une exception Modbus 11 | Mauvaise **Adresse d'unité** | Alignez l'adresse d'unité du module et celle du canal CODESYS |
| Le journal : « unit 255 ... GATEWAY_NO_RESPONSE (11) » | L'**Unit-ID** du serveur Modbus CODESYS vaut par défaut 16#FF (255) | Réglez-le sur l'**Adresse d'unité** du module (onglet **Général**). Voir [Connecter un automate](/guide/connect-a-plc#configurer-l-automate-codesys) |
| À chaque connexion : une requête refusée « ILLEGAL_ADDRESS (2) », puis « PLC disconnected … watchdog », en boucle | Une commande de l'onglet **Init serveur Modbus** vise une zone que le module n'a pas (vu : fonction 16 sur `m1`) ; CODESYS s'arrête après ce refus | Videz l'onglet **Init serveur Modbus**, ou faites-le viser une zone du module. Voir [Connecter un automate](/guide/connect-a-plc#configurer-l-automate-codesys) |
| Dans CODESYS, **Valeur actuelle** affiche « Pas actualisé (vérifier l'info-bulle) » | Les lignes ne sont pas reliées à des variables, ou les variables inutilisées ne sont pas actualisées | Reliez chaque ligne à une variable (onglet **ModbusTCPServer Mappage E/S**) et réglez **Toujours actualiser les variables** sur « Activé 2 (toujours dans la tâche du cycle de bus) ». Hors ligne seulement |

::: warning Peu vérifié avec CODESYS
Les lignes « unit 255 », « Init serveur Modbus » et « Pas actualisé » ont été vues sur un CODESYS Control Win V3 réel le 18 octobre 2026. Les autres causes viennent du code et des décisions du dépôt et n'ont pas été confirmées avec CODESYS (ADR 0045, étape 2).
:::

## Tags forcés

| Ce que vous voyez | Cause | Que faire |
| --- | --- | --- |
| Un badge **forcé** sur un tag, et la console : « Écriture de l'automate ignorée sur le tag forcé … : forcé à …, l'automate a écrit … » | Vous avez écrit ce tag depuis le viewer : l'écriture force le tag, et l'automate ne peut plus le changer | **Relâcher** le tag, ou **Relâcher tout** (barre de simulation, ou **Édition**, **Relâcher tous les tags forcés**) |
| « N tag(s) forcé(s) : l'automate ne peut pas les écrire » dans le bloc **Pont automate** | Idem | Bouton **Relâcher tout** du bloc |
| Une commande reste bloquée à une valeur alors que l'automate écrit autre chose | Le tag est forcé | Relâchez-le. Le cœur applique alors la dernière valeur écrite par l'automate |

## Liste d'E/S

| Ce que vous voyez | Cause | Que faire |
| --- | --- | --- |
| « Ce Pantin n'a pas encore de liste d'E/S (io.json). » | Aucun `io.json` | **Créer le mapping** |
| « Le fichier io.json est illisible, ou d'anciens fichiers io.csv sont présents : aucune modification n'est possible ici. » | Fichier cassé, ou ancien format | Corrigez le fichier, ou migrez-le avec `pnpm pantin io migrate <dossier>` |
| « La liste d'E/S n'a pas pu être lue. » | Erreur de lecture | **Réessayer** |
| « Le mapping affiché peut être périmé : la dernière lecture a échoué. » | La dernière relecture a échoué | **Réessayer** |
| **Exporter la GVL** grisé | Mapping absent, pas encore lu, ou invalide : l'infobulle le dit | Créez le mapping, ou corrigez les **Problèmes** |
| `pantin gvl` : « The mapping is invalid, so no GVL is generated: … » | Même cause, en ligne de commande | Corrigez `io.json` depuis le viewer, relancez la commande |
| `pantin gvl` : « No io.json in this folder: run "pantin io init" first. » | Pas de `io.json` | `pnpm pantin io init <dossier>` ou **Créer le mapping** |
| Des tags de l'automate qui n'apparaissent pas dans la GVL | Les tags **non affectés** n'y sont pas | Affectez-les dans **Tags non affectés**. `pnpm pantin gvl` écrit « note: N tag(s) are not mapped and not in the GVL » |

Dans la vue E/S, l'icône **Aller à la cellule concernée** (sous **Problèmes**)
mène à chaque problème.

## Simulation

| Ce que vous voyez | Cause | Que faire |
| --- | --- | --- |
| Rien ne bouge | La simulation est en pause | **Reprendre** dans la barre de simulation. La console dit « Simulation en pause » |
| « La simulation de ce Pantin n'a pas pu être reprise à l'ouverture » | La reprise automatique a échoué | **Reprendre** |
| « Commandes contradictoires : les deux bobines sont actives ; le tiroir reste en place. » | Les deux bobines d'un distributeur 5/3 sont à 1 | Ne commandez qu'une bobine à la fois |
| « Commandes contradictoires : marche avant et arrière commandées ensemble ; le contacteur déjà fermé le reste. » | Marche avant et marche arrière d'un contacteur inverseur sont à 1 ensemble | Ne commandez qu'un sens à la fois |
| Un **Défaut** actif (**Ne répond plus**, **Grippée**) | Un défaut a été injecté | Désactivez-le dans le groupe **Défauts** de l'inspecteur |
| « Erreur dans le pas de simulation : le pas est ignoré. » | Une erreur dans un pas de calcul | Regardez la sortie du cœur et signalez-la avec votre Pantin |

## Toujours bloqué ?

Les ADR du dépôt expliquent les choix derrière ces comportements, notamment
[0045](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0045-plc-bridge-tag-bus-io-mapping-and-modbus-slave.md),
[0046](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0046-security-of-the-plc-bridge.md)
et
[0050](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0050-bridge-started-from-the-viewer.md).

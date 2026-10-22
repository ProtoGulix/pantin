# Connecter un automate en OPC UA

Avec **OPC UA**, les rôles sont inversés par rapport à [Modbus TCP](/guide/connect-a-plc) : **l'automate est le serveur** et **Pantin est le client**. Pantin se connecte au serveur OPC UA de l'automate (CODESYS en fournit un), **lit les commandes** que le programme écrit dans ses variables et **écrit les retours** (fins de course, positions) dans d'autres variables. Le programme de l'automate n'a ni module d'E/S à déclarer ni canal à régler : il lui suffit de variables globales exposées par le serveur.

::: danger Pas encore essayé sur un vrai automate
Le chemin OPC UA est testé **contre un serveur OPC UA écrit pour les tests de Pantin**, dans une boucle fermée automatique (le cœur, le pont et le serveur de test, avec la confiance mutuelle des certificats). Il n'a **pas encore** été essayé contre un vrai automate CODESYS : c'est la prochaine étape, une démonstration manuelle. Tout ce qui concerne CODESYS dans cette page est donc écrit d'après sa documentation publique et est marqué **NON VÉRIFIÉ** quand c'est le cas. Les noms de menus de CODESYS ne sont pas donnés comme des faits.
:::

Cette page suppose que vous connaissez la liste d'E/S ([Tags, défauts et liste d'E/S](/guide/tags)) et la GVL ([Connecter un automate](/guide/connect-a-plc#configurer-l-automate-codesys)). Les noms en **gras** sont les libellés exacts du viewer en français.

## Modbus ou OPC UA ?

| | Modbus TCP | OPC UA |
| --- | --- | --- |
| Rôle de Pantin | esclave : l'automate l'interroge | client : Pantin interroge l'automate |
| Câblage côté automate | arbre des appareils : un serveur par module, des canaux, un mappage | aucun : des variables globales exposées par le serveur OPC UA |
| Adresses | des numéros de registre à calculer | le nom de la variable (le cœur déduit le NodeId) |
| Sécurité | aucune authentification | signature, chiffrement, certificats, utilisateur et mot de passe en option |
| Essayé sur un vrai automate | oui, le 18 octobre 2026 (CODESYS Control Win V3 x64) | **non** |

Choisissez Modbus si vous voulez la voie éprouvée. Choisissez OPC UA si le serveur de votre automate est déjà là, ou si vous voulez la sécurité du protocole. Les deux ponts peuvent tourner en même temps pour un même Pantin, chacun avec ses modules.

## Comment ça marche

```text
automate (serveur OPC UA)  <--OPC UA-->  pont OPC UA (Node.js)  <--tag bus-->  cœur  <--REST/SSE-->  viewer
```

- Le **pont OPC UA** est un processus séparé, lancé par le cœur à la demande avec l'option `--opcua-bridge`, que `pnpm serve` fournit. Il ouvre **une session par module** vers l'automate.
- Les **commandes** : une souscription par module ; le pont envoie au cœur chaque changement. Une impulsion plus courte que l'intervalle d'échantillonnage que le serveur a retenu peut être perdue.
- Les **retours** : le pont les écrit à chaque changement, et tous d'un coup à chaque ouverture de session.
- Si la connexion avec l'automate tombe, le pont la reprend tout seul (après 1 s, puis de plus en plus espacé jusqu'à 10 s) tant qu'il tourne. Si son lien avec le cœur se ferme, ou si les E/S changent, il s'arrête et il faut le relancer.

## Côté automate (CODESYS)

Ces étapes viennent de la documentation de CODESYS et de recherches publiques, **pas d'un essai** avec Pantin. Les noms de menus ci-dessous sont ceux de l'interface anglaise telle que les documentations la nomment ; leur traduction française et la version exacte ne sont pas vérifiées.

1. **Générez la GVL de Pantin** et collez-la dans le projet (voir [La GVL](#la-gvl) plus bas). Nommez l'objet GVL comme le dit l'en-tête de la liste : par défaut **GVL_Pantin**.
2. **Exposez les variables.** Sous l'**Application**, ajoutez un objet **Symbol Configuration** (NON VÉRIFIÉ : nom français et chemin du menu), avec l'option qui active les fonctions OPC UA (le fichier d'export porte `SupportOPCUA` dans ses réglages), et cochez les variables de la GVL.
   - Une **commande** (écrite par le programme, lue par Pantin) doit pouvoir être **lue** par le client.
   - Un **retour** (écrit par Pantin) doit pouvoir être **écrit** par le client.
   Les droits se règlent par variable dans cet objet (NON VÉRIFIÉ : libellés exacts). Si un droit manque, le pont le dit (voir [Lire les états et les raisons](#lire-les-etats-et-les-raisons)).
3. **Activez le serveur OPC UA** du runtime. Son port par défaut est 4840 d'après la documentation de CODESYS (NON VÉRIFIÉ sur un CODESYS Control Win V3 x64).
4. **Réglez la sécurité et l'identification.** Les versions récentes de CODESYS (SP17 et suivantes, d'après leur documentation, **NON VÉRIFIÉ** ici) demandent par défaut un **utilisateur d'appareil** et n'acceptent la connexion anonyme que si on l'autorise explicitement. Deux choix :
   - créez un utilisateur de l'appareil, puis donnez son nom au module dans Pantin (**Authentification** : **Utilisateur et mot de passe**) ;
   - ou autorisez la connexion anonyme dans les réglages de communication de l'appareil, pour un automate d'essai.
5. Si vous choisissez **Signer** ou **Signer et chiffrer**, l'automate doit proposer une politique de sécurité que Pantin sait utiliser : **Basic256Sha256**, **Aes128_Sha256_RsaOaep** ou **Aes256_Sha256_RsaPss**. Les anciennes politiques (Basic128Rsa15, Basic256) ne sont pas offertes. Les certificats sont à approuver des deux côtés : voir [Première connexion](#premiere-connexion-la-confiance-des-deux-cotes).

::: warning N'écrivez pas les retours dans le programme
Un retour est écrit par Pantin. Si votre programme écrit aussi la même variable, l'un des deux écrase l'autre. Ne lui donnez qu'un seul auteur.
:::

## Dans Pantin : créer et régler le module

Ouvrez la vue **E/S** (bouton **Config E/S** de la carte du pont). À côté de **Ajouter un module**, la liste **Type de transport du nouveau module** propose **Modbus TCP esclave** et **Client OPC UA** : choisissez **Client OPC UA**, puis **Ajouter un module**.

![La vue E/S avec un module Modbus m1 et un module Client OPC UA m2 : son en-tête et ses réglages](/screenshots/fr/io-opcua.webp)

L'en-tête du module dit ses réglages en mots, par exemple **Client OPC UA · port 4840 · Signer et chiffrer · Basic256Sha256 · anonyme** (**sans sécurité** quand le mode est **Aucune**). Les réglages d'un module :

| Réglage | Défaut | Règle |
| --- | --- | --- |
| **Clé** | `m1`, `m2`... | unique |
| **Port** | 4840 | 1 à 65535 : le port du serveur de l'automate |
| **Chemin du point d'accès** | vide | vide, ou commençant par `/` |
| **Mode de sécurité** | **Signer et chiffrer** | **Aucune**, **Signer** ou **Signer et chiffrer** |
| **Politique de sécurité** | **Basic256Sha256** | **Aucune**, **Basic256Sha256**, **Aes128_Sha256_RsaOaep** ou **Aes256_Sha256_RsaPss** |
| **Authentification** | **Anonyme** | **Anonyme** ou **Utilisateur et mot de passe** (avec un **Nom d'utilisateur**) |
| **URI de l'espace de noms** | vide : à remplir | l'espace de noms des variables de l'automate |
| **Préfixe du NodeId** | `\|var\|CODESYS Control Win V3 x64.Application.` | début du NodeId de chaque variable |
| **Nom de la GVL** | `GVL_Pantin` | un identifiant IEC |
| **Échantillonnage (ms)** | 20 | 0 à 10 000 |
| **Publication (ms)** | 20 | 10 à 60 000 |
| **Chien de garde (ms)** | 1000 | 100 à 3 600 000 |

- **Mode de sécurité** et **Politique de sécurité** vont ensemble : tous deux sur **Aucune**, ou aucun des deux. Sinon le cœur signale un problème de sécurité et le mapping reste invalide.
- **URI de l'espace de noms** est vide à la création : tant qu'elle l'est, le mapping est invalide. Aucune documentation de CODESYS ne donne cette valeur (**NON VÉRIFIÉ**). Laissez le pont la chercher : si l'URI n'existe pas sur le serveur, le journal écrit une ligne d'erreur qui liste la table des espaces de noms du serveur (**NamespaceArray**), et vous copiez la bonne.
- **Préfixe du NodeId** : la valeur par défaut suit une règle relevée dans des échanges publics, **non vérifiée sur un vrai automate**. La partie « appareil » du NodeId peut être le nom du runtime et non le nom de l'appareil du projet. Contrôlez-la dans le serveur OPC UA de l'automate.
- **Chien de garde (ms)** mesure ici le **silence du serveur** : le temps écoulé depuis la dernière réponse de publication de la souscription, qu'elle porte des données ou non. Au-delà, le pont ferme la session et la rouvre.

Chaque voie d'un module OPC UA a ces colonnes : **Signal**, **Unité**, **Variable**, **Noeud** (le NodeId déduit par le cœur, en lecture seule), **Identifiant** (**dérivé** ou **explicite**), **Type** (le type IEC), **Commentaire** et **Actions**. Un NodeId long passe à la ligne dans sa cellule.

Le **Type** est en lecture seule dans le viewer : `BOOL` pour un bit, `REAL` pour un flottant et `DINT` pour un entier. La variable de l'automate doit avoir ce type.

Le cœur déduit le **Noeud** : `s=` suivi du **Préfixe du NodeId**, du **Nom de la GVL**, d'un point et de la **Variable**. Une variable dont le nom est déjà pointé (`GVL_IO.Verin1.FinCourseSortie`) donne `s=` suivi du préfixe et de ce nom : elle désigne sa propre GVL ou son propre programme. Une même variable utilisée dans deux modules OPC UA doit avoir le même **Nom de la GVL** dans les deux.

## La GVL

La GVL de Pantin est la même que pour Modbus (bouton **Exporter la GVL**, ou `pnpm pantin gvl <dossier du Pantin>`). Pour un module OPC UA, son en-tête dit dans quelle GVL la coller : « Paste this list into a GVL named GVL_Pantin (module m2). » (le texte de l'en-tête est en anglais). Elle ne contient aucune adresse : c'est le nom de la variable qui sert.

::: warning Un automate d'essai seulement
Un identifiant **explicite** peut écrire n'importe quel noeud inscriptible du serveur. La cible doit être un automate en essai, jamais un automate dont les sorties pilotent une machine réelle. L'en-tête de la GVL le rappelle.
:::

## Reprendre le préfixe depuis l'export de symboles

L'import des symboles ([Reprendre les noms de variables de l'automate](/guide/connect-a-plc#reprendre-les-noms-de-variables-de-l-automate)) propose aussi un **préfixe de NodeId** pour chaque module OPC UA, bâti avec l'appareil et l'application du fichier.

![La fenêtre d'import avec le bloc Modules OPC UA : préfixe du NodeId proposé](/screenshots/fr/opcua-symbols.webp)

En haut de la fenêtre, le bloc **Modules OPC UA : préfixe du NodeId proposé (n)** porte, pour chaque module, le **Préfixe du NodeId proposé**, la raison (**Construit avec l'appareil « … » et l'application « … » du fichier.**) et un avertissement : **À vérifier : le NodeId peut porter le nom du runtime, pas celui de l'appareil. Appliquez-le, puis contrôlez-le dans le serveur OPC UA de l'automate.**

Le bouton **Appliquer ce préfixe au module m2** est à part du bouton **Appliquer** de la fenêtre : il écrit le préfixe du module comme une modification non enregistrée. Vérifiez-le avant de l'accepter : le préfixe est probablement faux si le runtime a été renommé. Le fichier de symboles est celui que décrit [Connecter un automate](/guide/connect-a-plc#reprendre-les-noms-de-variables-de-l-automate).

## Démarrer le pont

Dans le panneau de gauche, la carte **Pont automate · Client OPC UA** n'apparaît que lorsque le Pantin a un module OPC UA.

![La carte Pont automate · Client OPC UA, arrêtée, avec l'adresse de l'automate saisie](/screenshots/fr/opcua-card.webp)

1. Enregistrez le Pantin ; son mapping doit être valide (en particulier l'**URI de l'espace de noms**).
2. Dans le champ **Adresse de l'automate pour le module m2**, saisissez l'adresse de l'automate. Tant qu'il en manque une : **Saisissez l'adresse de l'automate de chaque module OPC UA avant de démarrer.** L'adresse n'est **jamais enregistrée** dans `io.json` : un dossier partagé ne doit pas viser l'automate d'un autre réseau. Le viewer la garde en mémoire pour la session.
3. Pour un module en **Utilisateur et mot de passe**, un champ **Mot de passe du module m2** apparaît : saisissez-le. **Gardé en mémoire par le coeur jusqu'à son arrêt, jamais écrit sur disque. Laissé vide, il garde le mot de passe déjà envoyé.** Le mot de passe n'est ni dans `io.json`, ni dans un journal, ni dans la console, ni dans la ligne de commande du pont.
4. Cliquez **Démarrer**. L'état passe de **Démarrage…** à **En marche** dès que le pont est prêt, **sans attendre l'automate** : un automate arrêté n'est pas un échec du pont, c'est l'état d'un module.

La carte rappelle le mode de connexion du module (**Connexion : anonyme** ou **Connexion : utilisateur et mot de passe (nom)**). Les réglages sont verrouillés pendant que le pont tourne ; toute modification des E/S l'arrête.

### Les adresses permises

Pantin ne se connecte qu'à **une adresse explicite, saisie par module** :

- l'adresse locale `127.0.0.1` (ou `::1`) : l'automate tourne sur la même machine ;
- ou **une adresse du réseau privé** (`10.x.x.x`, `172.16.x.x` à `172.31.x.x`, `192.168.x.x`, `fc00::/7`).

Sont refusés : un nom d'hôte (même `localhost`), `0.0.0.0`, une adresse publique, de lien local, de multidiffusion ou `100.64.0.0/10`. Le pont ne se connecte qu'à cette adresse et ce port, quelles que soient les adresses que le serveur annonce dans ses points d'accès, et n'ouvre aucun port en écoute.

Deux cas de sécurité :

- **Aucune** sécurité vers un automate du réseau local est permise, avec l'avertissement de la console : « Module m2 : la session OPC UA vers un automate du réseau local n'est ni signée ni chiffrée. » ;
- une **Authentification** par utilisateur avec **Aucune** sécurité vers un automate du réseau local est **refusée** : le mot de passe voyagerait en clair.

Par l'exposition à distance (tunnel Cloudflare), seule une adresse locale (`127.0.0.1` ou `::1`) est acceptée, sans mot de passe ni confiance de certificat à donner : ouvrez le viewer sur la machine pour cela.

## Première connexion : la confiance des deux côtés

Avec **Signer** ou **Signer et chiffrer**, chaque côté doit faire confiance au certificat de l'autre. Pantin ne fait **jamais** confiance seul à un premier contact. Il y a deux temps, dans cet ordre.

Aucune capture n'illustre ces invites : elles demandent un serveur OPC UA, que le script de captures n'a pas.

**Temps 1 : Pantin fait confiance au certificat de l'automate.** Au premier démarrage, le pont ne connaît pas le certificat du serveur. Il s'arrête, l'état passe à **En échec** avec **Le certificat de l'automate n'est pas approuvé**, et la carte affiche **Certificat de l'automate inconnu** avec les empreintes du certificat et sa validité (**Valide du … au …**). Comparez ces empreintes avec celles que l'automate affiche pour son certificat : **Comparez ces empreintes avec celles du certificat de l'automate avant de lui faire confiance. La confiance vaut pour tous les Pantin de cette machine.** Si elles sont identiques, cliquez **Faire confiance et redémarrer**.

**Temps 2 : l'automate fait confiance au certificat de Pantin.** Après ce redémarrage, l'automate peut refuser le certificat de Pantin. Le module affiche alors **l'automate a rejeté le certificat de Pantin** et la carte écrit : **L'automate a refusé le certificat de Pantin (SHA-1 …, SHA-256 …). Faites-lui confiance dans les réglages de sécurité OPC UA de l'automate ; Pantin réessaie toutes les 10 s.** Le bloc **Certificat de Pantin** donne le sujet, l'**URI de l'application** (de la forme `urn:pantin:<nom de la machine>:opcua-bridge`) et les empreintes **SHA-256** et **SHA-1** du certificat : faites-lui confiance dans l'automate en comparant l'empreinte (CODESYS peut n'afficher que le SHA-1, **NON VÉRIFIÉ**). Il n'y a **rien à redémarrer** : Pantin réessaie seul toutes les 10 s et le module se connecte.

Le chemin dans CODESYS pour approuver un certificat client (la liste des certificats rejetés, puis son approbation) n'a **pas été vérifié** ; consultez la documentation de votre version.

Quelques précisions :

- Le certificat de Pantin est créé au premier démarrage du pont. Sans lui, **Le certificat de Pantin et ses empreintes apparaissent au premier démarrage du pont.**
- Les certificats sont rangés dans un dossier de la **machine**, `$XDG_STATE_HOME/pantin/opcua-pki`, soit `~/.local/state/pantin/opcua-pki` par défaut (l'option `--opcua-pki-dir` du cœur en choisit un autre), hors de tout dossier de Pantins. **La confiance vaut donc pour tous les Pantin de la machine**, pas seulement pour celui qui l'a demandée.
- Un certificat de l'automate **expiré, pas encore valide, ou dont l'URI d'application ne correspond pas** n'est jamais accepté, même avec **Faire confiance et redémarrer** : le titre est **Le certificat de l'automate n'est pas valide** et la raison s'écrit après **Raison :**. Renouvelez le certificat dans l'automate.
- Avec la sécurité **Aucune**, aucun certificat n'est échangé.

## Lire les états et les raisons

Chaque module a une ligne, avec une pastille, sa clé, son port et son état **en toutes lettres** : **pont arrêté**, **en attente de l'automate** ou **automate connecté**. La couleur n'est jamais le seul signe : lisez le texte. Quand l'automate n'est pas connecté, la raison s'ajoute :

| Raison affichée | Ce que ça veut dire | Que faire |
| --- | --- | --- |
| **connexion fermée par l'automate** | La socket ou la session s'est fermée. Le pont réessaie seul (1 s, 2 s, 4 s... jusqu'à 10 s). | Vérifiez que l'automate tourne et que son serveur OPC UA est activé. |
| **l'automate ne répond plus** | Aucune réponse de publication pendant la durée du **Chien de garde (ms)**. Le pont ferme la session et se reconnecte. | Vérifiez le réseau et le programme de l'automate. Augmentez le chien de garde si l'automate est lent. |
| **l'automate n'a pas les variables attendues** | Après connexion, un noeud manque ou ne convient pas. Le pont ferme la session et réessaie toutes les 10 s. Le journal du pont écrit **une ligne d'erreur par problème**. | Lisez le journal (voir plus bas). |
| **l'automate a rejeté le certificat de Pantin** | L'automate ne fait pas encore confiance à Pantin. Le pont réessaie toutes les 10 s. | Faites-lui confiance dans l'automate (temps 2). |

Les commandes booléennes d'un module OPC UA qui n'est plus connecté sont remises à 0 par le cœur, comme pour Modbus ; les autres gardent leur valeur. La console écrit la raison avec les mots de la liste de la console (par exemple « plus de réponse dans le délai » ou « les noeuds de l'automate ne correspondent pas au mapping »).

### Un noeud manque ou ne convient pas

À chaque session, le pont lit le **type** et les **droits d'accès** de chaque noeud. Le journal écrit une ligne par problème, en anglais, par exemple :

```text
Node s=|var|CODESYS Control Win V3 x64.Application.GVL_Pantin.tige_verin_position (tag tige.verin.position) does not exist on the server. Check the node id prefix, the GVL name and that the variable is in the symbol configuration.
```

Les trois cas : le noeud n'existe pas (vérifiez le **Préfixe du NodeId**, le **Nom de la GVL** et que la variable est cochée dans la configuration des symboles) ; son type n'est pas celui du **Type** de la voie (changez le type de la variable dans l'automate) ; ses droits sont insuffisants (lecture pour une commande, écriture pour un retour).

Si l'**URI de l'espace de noms** n'existe pas sur le serveur, une seule ligne d'erreur liste la table des espaces de noms : copiez-y la bonne.

## Le journal et la ligne de commande

Le journal du pont OPC UA est dans le fichier `<dossier des Pantins>/.logs/<pantinId>/bridge-opcua_client.log`. Dans la version actuelle, la fenêtre **Journal du pont automate** ne montre que celui du pont Modbus ; pour OPC UA, utilisez le bloc d'échec de la carte ou la commande :

```sh
pnpm pantin bridge-log <pantinId> --transport opcua_client
```

Voir [Lire le journal du pont](/guide/connect-a-plc#lire-le-journal-du-pont) pour les autres options.

## Dépannage

| Ce que vous voyez | Cause | Que faire |
| --- | --- | --- |
| **Démarrer** grisé et `Démarrez le coeur avec --opcua-bridge <fichier> (pnpm serve l'ajoute).` | Le cœur a été lancé sans `--opcua-bridge` | Lancez le cœur avec `pnpm serve` |
| « Saisissez l'adresse de l'automate de chaque module OPC UA avant de démarrer. » | Un module n'a pas d'adresse de l'automate | Remplissez le champ **Adresse de l'automate pour le module …** |
| Le démarrage est refusé avec des problèmes de mapping | Mapping invalide, souvent l'**URI de l'espace de noms** vide, ou la sécurité mal appariée | Corrigez dans **Config E/S** |
| **Le certificat de l'automate n'est pas approuvé** | Premier contact avec ce certificat | Comparez les empreintes, puis **Faire confiance et redémarrer** |
| **Le certificat de l'automate n'est pas valide** | Certificat expiré, pas encore valide, ou URI d'application différente | Renouvelez le certificat dans l'automate : Pantin ne passe jamais outre |
| **l'automate a rejeté le certificat de Pantin** | L'automate ne connaît pas Pantin | Faites-lui confiance avec les empreintes du bloc **Certificat de Pantin** ; Pantin réessaie toutes les 10 s |
| **L'automate a refusé l'identification** | Mauvais nom d'utilisateur ou mot de passe, ou un automate CODESYS récent qui refuse la connexion anonyme | Vérifiez le **Nom d'utilisateur**, saisissez de nouveau le mot de passe, puis redémarrez. **Certains automates CODESYS récents refusent la connexion anonyme.** |
| **l'automate n'a pas les variables attendues** | Préfixe, GVL, type ou droits | Lisez le journal ; voir plus haut |
| Une ligne d'erreur qui liste la table `NamespaceArray` | L'**URI de l'espace de noms** est inconnue du serveur | Copiez la bonne URI |
| **l'automate ne répond plus** | Silence au-delà du **Chien de garde (ms)** | Vérifiez le réseau, le programme, ou augmentez le chien de garde |
| Une impulsion de l'automate n'arrive jamais dans Pantin | Elle est plus courte que l'intervalle d'échantillonnage que le serveur a retenu | Allongez l'impulsion dans le programme |
| Une écriture de l'automate semble sans effet | Le tag est **forcé** depuis le viewer | **Relâcher tout** : voir [Connecter un automate](/guide/connect-a-plc#tags-forces) |

## Sécurité

- Pantin est le client : il **écrit** dans les variables du serveur. Visez un automate **en essai**, jamais un automate qui pilote des sorties réelles.
- Les certificats et la confiance sont **à l'échelle de la machine** (voir plus haut).
- Anonyme reste le choix par défaut ; **Utilisateur et mot de passe** n'est permis vers le réseau local qu'avec une sécurité **Signer** ou **Signer et chiffrer**.
- Pantin n'est pas prévu pour un réseau de production.

## Limites connues

::: warning Ce qui n'a pas été essayé
- Aucune connexion à un vrai CODESYS n'a été faite : le serveur, la sécurité, les identifiants, les NodeId, l'espace de noms des variables, le port par défaut, les noms de menus de CODESYS, le comportement au redémarrage de l'automate et la période d'échange sont **NON VÉRIFIÉS**.
- Les adresses IPv6 en notation littérale n'ont pas été essayées.
- Windows n'a pas été essayé : les chemins du dossier des certificats ne sont pas vérifiés.
- Les entiers 64 bits (`LINT`) perdent leurs bits de poids faible au-delà de 2^53, car les tags sont des nombres JavaScript.
- La fenêtre **Journal du pont automate** ne montre pas encore le journal du pont OPC UA ; l'identifiant explicite et le **Type** d'une voie ne sont pas modifiables dans le tableau.
:::

## Voir aussi

- [Connecter un automate (Modbus TCP)](/guide/connect-a-plc)
- [Tutoriel : reprendre les variables de l'automate](/guide/tutorial-plc-symbols)
- [Dépannage](/guide/troubleshooting)
- [Décision d'architecture 0065](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0065-opc-ua-client-bridge.md)

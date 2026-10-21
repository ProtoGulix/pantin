# Tutoriel : reprendre les variables d'un programme CODESYS

Ce tutoriel part d'un programme CODESYS qui existe déjà et de l'exemple
[`examples/plc-cylinder`](https://github.com/ProtoGulix/pantin/blob/develop/examples/plc-cylinder/README.md).
Au lieu de retaper à la main, dans Pantin, les noms des variables du programme, vous
les lisez dans l'export de symboles de CODESYS. À la fin, la boucle est fermée : le
programme pilote le vérin et lit ses capteurs.

Il suppose que vous avez suivi le [tutoriel du vérin](/guide/tutorial) (ou que vous
avez copié l'exemple `plc-cylinder` depuis la section **Exemples** de l'Accueil) et que vous connaissez les réglages de
[Connecter un automate](/guide/connect-a-plc). La fenêtre d'import est décrite en
détail dans [Reprendre les noms de variables de l'automate](/guide/connect-a-plc#reprendre-les-noms-de-variables-de-l-automate) ;
ses boutons et ses champs sont listés dans la [vue E/S](/reference/views#la-fenetre-importer-des-symboles-api).

::: tip Pour essayer sans CODESYS
Le fichier `packages/plc-symbol-formats/fixtures/codesys-3.5-sp22.xml` du dépôt est
un vrai export (CODESYS 3.5 SP22, nom de projet remplacé). Il suffit pour suivre les
étapes 2, 3 et 5 sans CODESYS.
:::

Les noms en **gras** sont les libellés exacts du viewer en français.

## Ce que fait l'import, et ce qu'il ne fait pas

- Il **propose** un nom de variable pour chaque signal déjà mappé, et vous validez.
- Il ne crée aucune voie, ne change aucune adresse Modbus et **ne conserve jamais les
  symboles** : seuls les noms retenus sont écrits dans `io.json`.
- Le fichier de symboles ne contient **aucune adresse Modbus** : le câblage des canaux
  se fait toujours dans l'arbre des appareils de CODESYS (étape 4).

## 1. Exporter les symboles depuis CODESYS

1. Dans l'arbre du projet, sous l'**Application**, ajoutez un objet **Symbol
   Configuration** (en français, l'objet s'appelle probablement **Configuration des
   symboles** : NON VÉRIFIÉ ; le chemin exact du menu d'ajout n'a pas été vérifié non
   plus, cherchez « Ajouter un objet » dans le menu contextuel de l'application).
2. Dans cet objet, cochez les variables que Pantin doit connaître : celles de votre
   programme qui sont reliées aux canaux du module (commandes et capteurs). Les
   autres variables n'ont pas besoin d'y figurer.
3. Lancez **Build > Generate Code** (en français, probablement **Compiler > Générer
   le code** : NON VÉRIFIÉ).
4. Le fichier `<projet>.<appareil>.<application>.xml` est écrit dans le dossier du
   projet, par exemple `monprojet.Device.Application.xml`. C'est celui-là qu'il faut
   donner à Pantin. Le fichier `<application>._symbols`, que CODESYS envoie à
   l'automate, est un autre fichier : Pantin ne le lit pas.

Le format du fichier a été relevé sur un export réel de CODESYS 3.5 SP22 ; le chemin
des menus vient de la documentation de CODESYS et d'un exemple tiers (version 3.5 SP12),
pas d'un essai sur SP22. Les autres versions, les autres cibles (WAGO, Linux) et
l'objet « IEC Symbol Set Configuration » des versions récentes ne sont pas vérifiés.

## 2. Importer les symboles dans Pantin

![La vue E/S avec le module m1, ses réglages et le tableau des voies](/screenshots/fr/io-view.webp)

1. Si vous n'avez pas votre copie, cliquez la carte **plc-cylinder** de la section **Exemples** de l'Accueil, gardez le nom proposé et cliquez **Créer** ; sinon ouvrez votre copie. Dans le bloc **Pont automate**, cliquez
   **Config E/S** : la vue **E/S** s'affiche.
2. Cliquez **Importer des symboles API…** dans la barre de la vue. Si le bouton est
   grisé, le mapping n'est pas lisible : lisez l'info-bulle et les problèmes listés
   sous le tableau.
3. Choisissez le fichier `.xml` (8 Mio au plus). Le cœur le lit et la fenêtre
   **Importer des symboles API** s'ouvre. Rien n'est écrit avant **Appliquer**.

![La fenêtre d'import des symboles, avec ses cinq sections et le résumé en bas](/screenshots/fr/io-symbols.webp)

Cette capture vient d'un autre fichier de symboles que le fichier d'essai (un fichier
fabriqué pour montrer toutes les sections remplies) : avec le fichier d'essai, les
sections n'ont pas ce contenu.

### Lire la fenêtre

En haut, vérifiez le **Format reconnu**, le nombre de symboles lus et la ligne
**Projet … · appareil … · application …** : est-ce bien votre projet ?

Parcourez ensuite les cinq sections, de haut en bas :

1. **Correspondances sûres** : type compatible, aucune remarque, cases cochées au
   départ. Avec `plc-cylinder` et le fichier d'essai, trois signaux y figurent :
   `tige.verin-min.state`, `tige.verin-max.state` et `tige.verin.position` reçoivent
   `GVL.verin1_verin_min_state`, `GVL.verin1_verin_max_state` et
   `GVL.verin1_verin_position` (correspondance **fin du nom reconnue (clé et
   membre)**). Lisez chaque ligne : **Variable actuelle**, **Variable proposée**,
   **Correspondance**.
2. **À vérifier** : cases décochées au départ. Une ligne marquée d'un trait vertical,
   d'un triangle d'avertissement et d'une phrase qui explique ce qu'il faut vérifier (elle peut venir du type ou du
   transport, en anglais) a une remarque : cochez-la seulement si vous êtes sûr. Une ligne **Type incompatible :
   cette ligne ne sera pas appliquée.** n'a pas de case.
3. **Inchangées** : la voie porte déjà ce nom. Ici, les deux commandes
   `verin1_verin1_coil_14` et `verin1_verin1_coil_12`.
4. **Signaux sans correspondance** : choisissez la variable dans la liste déroulante
   de la ligne, ou laissez **(ne pas changer)**. Avec `plc-cylinder` et le fichier
   d'essai, la section est vide (**Aucune ligne.**).
5. **Symboles non utilisés** : les variables de l'export qu'aucun signal ne prend (ici
   les constantes, les variables de configuration d'E/S et les variables de `PLC_PRG`
   qu'aucun signal ne prend), avec la raison.
   Elles ne sont pas appliquées, c'est normal.

Le nombre en bas, **Variables à appliquer : n**, compte les cases cochées et les choix
faits dans les listes. Cliquez **Appliquer** : seules ces lignes sont envoyées.
**Annuler**, **Échap** et la croix ferment la fenêtre sans rien changer.

![La fenêtre après Appliquer : trois variables appliquées, modification non enregistrée](/screenshots/fr/io-symbols-done.webp)

La fenêtre dit **Variables appliquées : 3. Modification non enregistrée.** Si le cœur
refuse des lignes (par exemple une variable déjà prise par un autre tag), elles sont
listées avec la raison, en anglais. Les noms appliqués sont une modification comme
les autres : fermez la fenêtre et **enregistrez le Pantin** (Ctrl+S), ou annulez-la.

## 3. Régénérer la GVL

Les noms importés sont des **noms pointés** (`GVL.verin1_verin_min_state`) : ils
désignent des variables que votre programme déclare déjà. La GVL de Pantin ne les
déclare donc plus, sinon CODESYS verrait deux fois la même variable. Elle les liste
seulement en commentaire d'en-tête.

1. Dans la vue **E/S**, cliquez **Exporter la GVL**. Le bouton est grisé tant que le
   mapping est absent, illisible ou invalide.
2. Ou, en ligne de commande, depuis un clone du dépôt :

   ```sh
   pnpm pantin gvl <dossier du Pantin>
   ```

Avec `plc-cylinder` après l'import, la GVL ne déclare plus que les deux commandes
(le texte de la GVL est en anglais) :

```text
// Declared by your PLC program, not here (a dotted name). Map these channels
// to those variables in the device tree:
//   GVL.verin1_verin_min_state : BOOL // m1 discrete_input 0, tige.verin-min.state
//   GVL.verin1_verin_max_state : BOOL // m1 discrete_input 1, tige.verin-max.state
//   GVL.verin1_verin_position : REAL // m1 input_register 0, tige.verin.position
VAR_GLOBAL
  verin1_verin1_coil_14 : BOOL; // m1 coil 0, verin1.verin1.coil_14
  verin1_verin1_coil_12 : BOOL; // m1 coil 1, verin1.verin1.coil_12
END_VAR
```

(Cet extrait omet l'avertissement qui ouvre le fichier.) L'export de la vue **E/S**
contient les modifications non enregistrées ; enregistrez tout de même avant de
passer à la suite.

Ne remplacez pas la GVL de votre projet par ce fichier : dans le fichier d'essai, les
cinq variables sont déclarées dans la `GVL` de l'automate, et les noms pointés importés
désignent cette GVL. Donc :

- les variables nommées avec un point restent déclarées là où elles sont, dans la GVL
  de votre programme ;
- seules les variables sans point (ici les deux commandes) viennent du fichier généré.
  Mettez-le dans une GVL séparée, ou gardez les variables pointées dans la GVL
  existante et retirez-en seulement les doublons. Avec le fichier d'essai, la GVL
  déclare déjà les deux commandes : c'est la seconde option qui s'applique.

Comment CODESYS traite un doublon de nom ou une GVL séparée : NON VÉRIFIÉ.

## 4. Fermer la boucle dans CODESYS

Les réglages sont ceux de [Configurer l'automate](/guide/connect-a-plc#configurer-l-automate-codesys) :
un **Modbus_TCP_Server** par module, les canaux, puis le mappage E/S. Ici, dans la
colonne **Variable** de l'onglet **ModbusTCPServer Mappage E/S** :

1. Reliez chaque canal à la variable proposée par Pantin : par exemple le `Bit0` des
   capteurs à `GVL.verin1_verin_min_state`. Les commandes pointent sur les variables
   de la nouvelle GVL.
2. Compilez, connectez-vous à l'automate (**En ligne**), puis démarrez le programme.
3. Dans Pantin, enregistrez, vérifiez que la vue **E/S** n'a aucun problème, puis
   cliquez **Démarrer** dans le bloc **Pont automate**. L'état passe à **En marche**,
   puis le module affiche **automate connecté** dès que CODESYS l'interroge.
4. Vérifiez la boucle : activez dans votre programme la commande qui fait sortir le
   vérin. Il sort à l'écran en 2,5 s environ, et le capteur de fin de course sortie
   (`tige.verin-max.state`) passe à vrai dans Pantin comme dans la variable de CODESYS.
   Faites de même pour la rentrée.

Si le module reste **en attente de l'automate**, ou si le journal du pont montre une
requête refusée, voir [Dépannage](/guide/troubleshooting).

::: warning NON VÉRIFIÉ
- Qu'un canal Modbus de CODESYS accepte comme cible une variable désignée par un nom
  pointé (`GVL.xxx`) dans le mappage E/S : non vérifié.
- Qu'un programme CODESYS réel pilote `plc-cylinder` avec les noms importés par ce
  tutoriel : non vérifié. L'essai du 18 octobre 2026 utilisait des noms écrits à la
  main.
:::

## 5. Variante : en ligne de commande

Les étapes 2 et 3 existent aussi sans le viewer, utiles dans un script :

```sh
pnpm pantin io import-symbols <dossier du Pantin> <fichier.xml>
pnpm pantin io import-symbols <dossier du Pantin> <fichier.xml> --apply
pnpm pantin gvl <dossier du Pantin> --output GVL.txt
```

- Sans `--apply`, la première commande n'écrit rien et affiche l'aperçu (en anglais) :
  **Matched**, **To check (warnings)**, **Incompatible (never applied)**,
  **Unchanged**, **Unmatched signals** et **Unused symbols**.
- `--apply` écrit dans `io.json` les correspondances compatibles ; `--accept-warnings`
  y ajoute celles à vérifier. Le code de sortie est 1 si le cœur a refusé une entrée à l'application.
- Travaillez sur une copie du dossier, ou sur un Pantin qu'aucun cœur n'a ouvert avec
  des modifications non enregistrées : la commande écrit directement dans le dossier.

## Ensuite

- [Connecter un automate](/guide/connect-a-plc) : le réseau, le chien de garde, les
  règles de correspondance en détail.
- [Tags, défauts et liste d'E/S](/guide/tags)
- [Dépannage](/guide/troubleshooting)

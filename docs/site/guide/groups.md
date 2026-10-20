# Grouper, dégrouper, déplacer un corps

Ces procédures règlent la structure d'un Pantin : quels corps bougent ensemble. Après chaque changement, vérifiez vos liaisons dans la vue **Liaisons** : elle montre les groupes comme des rectangles arrondis, avec le nombre de corps qui les suivent, et ce qui reste rattaché au Monde (voir [La vue Liaisons](/reference/views#la-vue-liaisons)). Les mots **corps**, **assemblage** et **groupe** sont définis dans [Le modèle d'un Pantin](/guide/model#les-concepts-corps-assemblage-groupe).

## Faire un groupe

Faites un groupe quand l'import n'a pas séparé ce qui bouge. Un STEP sans sous-assemblage, par exemple, donne tous les corps dans un seul assemblage, sans liaison.

**Grouper…** crée un sous-assemblage avec les corps choisis. Une liaison fixe le relie à l'assemblage d'origine.

1. Dans l'arborescence, cliquez le premier corps. Ajoutez les autres avec <kbd>Ctrl</kbd>+clic (ajoute ou retire une ligne), <kbd>Maj</kbd>+clic (la plage jusqu'à la ligne cliquée) ou <kbd>Maj</kbd>+flèches. Les éléments sélectionnés ensemble sont des corps et des sous-groupes d'**un même assemblage**.
2. Choisissez **Édition** puis **Grouper…**, ou **Grouper…** dans le menu contextuel d'une ligne sélectionnée.
3. Une ligne apparaît sous l'arborescence : « Grouper N éléments de l'assemblage « X » : quel nom donner au groupe ? ». Tapez le nom dans le champ **Nom du groupe**, puis cliquez **Grouper** (ou **Annuler**).
4. Le message « Groupe « nom » créé. » s'affiche.

![Le panneau de gauche : deux corps sélectionnés, et la ligne qui demande le nom du groupe](/screenshots/fr/group-prompt.webp)

Rien ne bouge à l'écran. Le groupe est fixé à l'assemblage par une liaison **Fixe** du même nom. Pour que tout le groupe bouge, transformez cette liaison en **Glissière** ou en **Pivot limité**.

**Grouper…** n'est proposé que si la sélection est faite de corps et de sous-groupes d'un même assemblage, rangé dans un Pantin.

Le message peut ajouter deux phrases :

- **Liaisons supprimées : …** : des liaisons fixes devenues inutiles entre les corps du groupe et le reste de l'assemblage sont retirées.
- **Des tags ont été renommés : régénérez la GVL de l'automate.** : les liaisons des corps déplacés prennent le préfixe du nouveau groupe, donc leurs tags changent. Le fichier `io.json` suit. Il faut en revanche **exporter à nouveau la GVL** (voir [La liste d'E/S](/guide/tags#la-liste-d-e-s-io-json)) et la recharger dans le programme de l'automate.

### Quand le cœur refuse

Le cœur refuse, sans rien changer, quand le groupe déplacerait un corps malgré lui. Il affiche son message tel quel. Cas fréquents :

| Situation | Que faire |
| --- | --- |
| Un corps du groupe est suspendu, par une liaison mobile, à un corps de l'assemblage qui n'est pas dans le groupe : le groupe l'emporterait. | Ajoutez le corps parent au groupe, ou supprimez la liaison. |
| Un corps du groupe est relié par une liaison à un corps qui n'est pas dans le groupe : le groupe le laisserait derrière lui. | Ajoutez ce corps au groupe, ou supprimez la liaison. |
| Une liaison à supprimer est utilisée par un préactionneur, un actionneur, un capteur ou une bande. | Retirez d'abord cet élément, puis recommencez. |

## Défaire un groupe

**Dégrouper** dissout un groupe dans l'assemblage où il est rangé. Ses corps et ses sous-groupes passent dans cet assemblage, sans bouger à l'écran.

1. Sélectionnez la ligne du groupe (un assemblage rangé dans un autre assemblage).
2. Choisissez **Édition** puis **Dégrouper**, ou **Dégrouper** dans son menu contextuel.
3. Le message « Groupe « nom » dissous. » s'affiche, avec les mêmes phrases éventuelles que pour **Grouper…** (liaisons supprimées, GVL à régénérer).

Un assemblage de premier niveau ne se dégroupe pas : il n'y a pas d'assemblage où le verser.

Le cœur refuse tant que les corps du groupe cesseraient de le suivre. Cas fréquents :

| Situation | Que faire |
| --- | --- |
| Une glissière ou un pivot déplace le groupe : ses corps ne suivraient plus. | Rendez cette liaison **Fixe**, ou supprimez-la, puis dégroupez. |
| Le groupe est tenu par une liaison vers un autre assemblage que celui où il se dissoudrait. | Supprimez cette liaison ou changez son parent. |
| Le groupe ne bouge pas, mais l'assemblage où il se dissoudrait est déplacé par une liaison : ses corps se mettraient à le suivre. | Dégroupez quand cet assemblage ne bouge pas, ou tenez d'abord le groupe par une liaison fixe vers lui. |
| Le groupe est suspendu à quelque chose qui bouge dans l'assemblage d'arrivée. | Changez d'abord le parent de cette liaison. |
| Une clé de tag d'un élément du groupe existe déjà dans l'assemblage d'arrivée (le message propose une clé libre). | Renommez l'une des deux clés. |

Grouper puis dégrouper ne redonne pas forcément le Pantin de départ. Rien ne bouge à l'écran, mais les liaisons fixes supprimées ne sont pas rétablies et des identifiants ou des clés de tag peuvent différer. Pour revenir en arrière, abandonnez les modifications non enregistrées.

## Nettoyer les anciennes liaisons fixes

Un Pantin fait avant les groupes contient souvent des liaisons fixes entre des corps d'un même assemblage. Un corps sans liaison parente suit déjà son groupe : ces liaisons ne font plus rien. **Supprimer les liaisons fixes redondantes…** les retire en une seule fois.

1. Choisissez **Édition** puis **Supprimer les liaisons fixes redondantes…**, ou la même entrée dans le menu contextuel de la ligne du Pantin. La commande agit sur tout le Pantin, pas sur la sélection.
2. Sans liaison à supprimer, le message « Aucune liaison fixe redondante. » s'affiche et rien d'autre n'arrive.
3. Sinon, une ligne apparaît : « Supprimer N liaisons fixes redondantes ? Les corps suivent déjà leur groupe : rien ne bouge. » Elle est suivie de deux listes, chacune avec un titre et un nombre :
   - **À supprimer (N)** : les liaisons retirées, rangées par assemblage ;
   - **Conservées (N)** : les liaisons fixes gardées, avec la raison, par exemple « son parent bouge avec « nom » ». Cette liste n'apparaît que si le cœur en garde.
4. Cliquez **Supprimer** (ou **Annuler**). Le message donne les liaisons supprimées et rappelle que **Ne pas enregistrer**, à la fermeture, annule l'opération. Une liaison modifiée ou supprimée entre l'aperçu et votre clic est laissée de côté et comptée comme ignorée dans le message.

![Le panneau de gauche : la ligne qui propose de supprimer deux liaisons fixes redondantes, avec les listes À supprimer et Conservées](/screenshots/fr/redundant-joints-prompt.webp)

Le cœur ne supprime qu'une liaison fixe dont la suppression ne déplace rien : le parent et l'enfant sont dans le même assemblage, et aucune liaison mobile ne se trouve au-dessus du parent. Une liaison fixe entre deux assemblages n'est jamais proposée : elle tient le groupe enfant en place. Une liaison fixe est conservée quand une liaison mobile, entre deux corps du même assemblage, se trouve au-dessus de son parent. Une liaison fixe dont le parent est le groupe lui-même reste supprimable, même si le groupe bouge.

Le Pantin ne change pas d'aspect. Rien n'est écrit sur le disque avant l'enregistrement. Aucun tag n'est renommé : il n'y a pas de GVL à régénérer.

## Déplacer un corps dans un autre assemblage

Glissez un corps sur un autre assemblage, ou choisissez l'**Assemblage** dans l'inspecteur. Les liaisons fixes entre le corps et l'ancien assemblage sont supprimées et listées dans le message.

Le cœur refuse le déplacement dans ces cas :

- le corps, son ancien groupe et son nouveau groupe ne sont pas déplacés par la même liaison (ou par aucune) : déplacez alors le groupe entier, ou utilisez **Grouper…** ;
- une liaison mobile relie le corps à l'ancien assemblage (`Joint "…" (…) links … and moves. Delete it or make it a group joint first, then move the body.`) ;
- le corps « sauterait » quand les groupes bougent (`Body "…" would jump when the groups move: … Move it to an assembly that moves with "…".`) ;
- une liaison fixe à supprimer est utilisée par un autre élément.

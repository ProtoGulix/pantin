# Grouper, dégrouper, déplacer un corps

Ces procédures règlent la structure d'un Pantin : quels corps bougent ensemble. Les mots **corps**, **assemblage** et **groupe** sont définis dans [Le modèle d'un Pantin](/guide/model#les-concepts-corps-assemblage-groupe).

## Faire un groupe

Faites un groupe quand l'import n'a pas séparé ce qui bouge : un STEP sans sous-assemblage donne tous les corps dans un seul assemblage, sans liaison. La commande **Grouper…** crée un sous-assemblage avec les corps choisis et une liaison fixe qui le relie à l'assemblage d'origine.

1. Dans l'arborescence, cliquez le premier corps. Ajoutez les autres avec <kbd>Ctrl</kbd>+clic (ajoute ou retire une ligne), <kbd>Maj</kbd>+clic (la plage jusqu'à la ligne cliquée) ou <kbd>Maj</kbd>+flèches. On ne sélectionne ensemble que des corps et des sous-groupes d'**un même assemblage**.
2. Choisissez **Édition** puis **Grouper…**, ou **Grouper…** dans le menu contextuel d'une ligne sélectionnée.
3. Une ligne apparaît sous l'arborescence : « Grouper N éléments de l'assemblage « X » : quel nom donner au groupe ? ». Tapez le nom dans le champ **Nom du groupe**, puis cliquez **Grouper** (ou **Annuler**).
4. Le message « Groupe « nom » créé. » s'affiche.

![Le panneau de gauche : deux corps sélectionnés, et la ligne qui demande le nom du groupe](/screenshots/fr/group-prompt.webp)

Rien ne bouge à l'écran : le groupe est fixé à l'assemblage par une liaison **Fixe** du même nom. Transformer cette liaison en **Glissière** ou en **Pivot limité** fait bouger tout le groupe.

Le message peut ajouter deux phrases :

- **Liaisons supprimées : …** : des liaisons fixes devenues inutiles entre les corps du groupe et le reste de l'assemblage ont été retirées ;
- **Des tags ont été renommés : régénérez la GVL de l'automate.** : les liaisons des corps déplacés prennent le préfixe du nouveau groupe, donc leurs tags changent. Le fichier `io.json` suit ; il faut en revanche **exporter à nouveau la GVL** (voir [La liste d'E/S](/guide/tags#la-liste-d-e-s-io-json)) et la recharger dans le programme de l'automate.

**Grouper…** n'est proposé que si la sélection est faite de corps et de sous-groupes d'un même assemblage, lui-même rangé dans un Pantin.

Le cœur refuse, sans rien changer, quand le groupe déplacerait un corps malgré lui. Son message est affiché tel quel. Cas fréquents :

| Situation | Que faire |
| --- | --- |
| Un corps du groupe est suspendu, par une liaison mobile, à un corps de l'assemblage qui n'est pas dans le groupe : le groupe l'emporterait. | Ajoutez le corps parent au groupe, ou supprimez la liaison. |
| Un corps du groupe est relié par une liaison à un corps qui n'est pas dans le groupe : le groupe le laisserait derrière lui. | Ajoutez ce corps au groupe, ou supprimez la liaison. |
| Une liaison à supprimer est utilisée par un préactionneur, un actionneur, un capteur ou une bande. | Retirez d'abord cet élément, puis recommencez. |

## Défaire un groupe

**Dégrouper** dissout un groupe dans l'assemblage où il est rangé : ses corps et ses sous-groupes passent dans cet assemblage, sans bouger à l'écran.

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

Grouper puis dégrouper ne garantit pas de retrouver le document de départ. Ce qui est garanti : rien ne bouge à l'écran. Les liaisons fixes supprimées ne sont pas rétablies, des identifiants ou des clés de tag peuvent différer, et une liaison mobile qui était suspendue à un corps rigide peut revenir rattachée au groupe parent plutôt qu'à ce corps. Pour annuler, abandonnez les modifications non enregistrées.

## Déplacer un corps dans un autre assemblage

Glisser un corps sur un autre assemblage (ou choisir l'**Assemblage** dans l'inspecteur) le déplace. Ses liaisons fixes avec l'ancien assemblage sont supprimées et listées dans le message. Le cœur refuse le déplacement si le corps, son ancien groupe et son nouveau groupe ne sont pas déplacés par la même liaison (ou par aucune) : déplacez alors le groupe entier, ou utilisez **Grouper…**. Le cœur refuse aussi quand une liaison mobile relie le corps à l'ancien assemblage (`Joint "…" (…) links … and moves. Delete it or make it a group joint first, then move the body.`), ou quand le corps « sauterait » quand les groupes bougent (`Body "…" would jump when the groups move: … Move it to an assembly that moves with "…".`). Les liaisons fixes à supprimer ne doivent pas être utilisées par un autre élément.

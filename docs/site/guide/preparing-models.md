# Préparer ses modèles 3D

Cette page explique comment préparer vos fichiers **dans votre logiciel de CAO, avant l'import**. Quelques minutes d'organisation à cet endroit évitent la plupart des manipulations dans le viewer. Les mots **corps**, **assemblage** et **groupe** sont définis dans [Le modèle d'un Pantin](/guide/model#les-concepts-corps-assemblage-groupe).

## La règle d'or : un sous-assemblage par groupe cinématique

**Rangez dans un même sous-assemblage tout ce qui bouge ensemble.**

Un groupe cinématique est un ensemble de pièces qui se déplacent d'un bloc. Dans un vérin, le corps (le fût) est d'un côté ; la tige et son embout, qui sortent et rentrent ensemble, sont de l'autre. Cela fait deux groupes, donc deux sous-assemblages :

```
Vérin                          assemblage racine
├── Fût                        sous-assemblage : reste en place
│   └── fût
└── Tige                       sous-assemblage : sort et rentre
    ├── tige
    └── embout
```

### Pourquoi

À l'import d'un STEP, chaque sous-assemblage devient un **assemblage** Pantin et chaque pièce un **corps** (fichiers : [ADR 0040](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0040-nested-assemblies-from-step.md), [ADR 0055](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0055-assemblies-as-rigid-groups.md)). Les corps d'un assemblage restent collés à lui, sans liaison à créer. L'import crée une liaison **Fixe** par sous-assemblage, du groupe parent au groupe enfant. Pour animer la tige, vous transformez simplement cette liaison fixe en **Glissière**.

Si le sous-assemblage n'existe pas dans le fichier, vous devez le fabriquer vous-même après l'import avec **Grouper…** (voir plus bas). C'est faisable, mais il est plus rapide de le faire une fois dans la CAO.

### Exemples vus à l'usage

Ces deux cas sont tirés des essais du projet, décrits de façon générique.

- **Un vérin de fournisseur**, exporté en STEP : trois pièces rangées dans un seul assemblage, importées comme trois corps dans un seul assemblage. Pantin n'a pas pu deviner que la tige bouge : il faut soit scinder l'assemblage dans la CAO (fût d'un côté, tige et embout de l'autre), soit utiliser **Grouper…** après l'import.
- **Une autre machine**, exportée en STEP avec dix assemblages : l'import a produit neuf liaisons fixes entre groupes, une par sous-assemblage enfant ([ADR 0055](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0055-assemblies-as-rigid-groups.md), point 10 et amendement « moving a body between groups (slice 3) » du 18 octobre 2026 : vérifié avec le vrai convertisseur). Ses 51 pièces n'ont demandé aucune liaison à l'intérieur de leurs assemblages.

## Les formats

| Format | Ce que Pantin en tire | À savoir |
| --- | --- | --- |
| **STEP** (`.stp`, `.step`) | La structure est conservée : chaque sous-assemblage devient un assemblage, chaque pièce un corps. Le tout est converti en mètres. | Le format à préférer. La conversion se fait par un processus séparé et peut durer jusqu'à 2 minutes. |
| **GLB** (glTF) | Un fichier donne **un seul corps**. | Les noeuds du fichier ne sont pas séparés en plusieurs corps pour l'instant (pistes notées dans le backlog du projet). Deux pièces qui bougent séparément doivent donc être deux fichiers. |
| **STL** | Un fichier donne un corps. | Pas d'unité ni de hiérarchie : le formulaire d'import demande l'**Unité**. |

### Ce que fait la conversion d'un STEP

- Chaque pièce (feuille de l'arbre) devient un corps, dans un fichier GLB en mètres, avec l'axe Z vers le haut, à la place que lui donne l'assemblage : rien ne bouge par rapport à la CAO.
- Chaque sous-assemblage devient un assemblage, à tous les niveaux de l'arbre. Un fichier à plusieurs racines donne un assemblage portant le nom du fichier.
- Les pièces sans faces à dessiner (fils, points, géométrie de construction) sont ignorées.
- Un STEP dont une instance d'assemblage est **mise à l'échelle ou en miroir** est refusé : « The assembly "nom" is placed with a scale or a mirror, which Pantin cannot represent. Export the model without scaled or mirrored instances. » Transformez les pièces en miroir en vraies pièces (symétrique dessiné, sans instance miroir) avant l'export.
- Un STEP sans aucun solide est refusé : exportez le modèle avec ses solides, pas seulement des surfaces ou un fil de fer.
- Un STEP sans sous-assemblage donne un seul assemblage portant tous les corps, sans liaison. Un GLB ou un STL donne un assemblage portant un corps.

## Unités, axe vertical et repères

- **Unités.** Pour un STEP et un GLB, le fichier porte sa propre unité : rien à choisir. Pour un STL, le formulaire demande l'**Unité** (m, mm, cm ou pouces) : choisissez celle de votre export, sinon la pièce apparaît mille fois trop grande ou trop petite.
- **Axe vertical.** Le formulaire propose **Y vers le haut (standard glTF)** ou **Z vers le haut (CAO)**. Pour un STEP, l'option est affichée mais **sans effet** : un STEP converti est toujours en Z vers le haut, comme la CAO. Pour un GLB ou un STL, choisissez la valeur qui correspond à votre export.
- **Chaque assemblage garde son repère de CAO** ([ADR 0040](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0040-nested-assemblies-from-step.md), point 4). L'origine et l'axe d'une liaison sont exprimés dans le repère de l'assemblage parent. Si un vérin est monté incliné dans la machine, sa tige glisse donc le long de **son** axe, pas selon l'axe du monde.

### Placer la pièce selon les axes de la CAO

Dessinez les mouvements le long des axes de la CAO quand c'est possible : un mouvement aligné sur X, Y ou Z se lit et se règle facilement. Pour les autres cas, le bouton **Prendre l'axe sur une face** de la liaison lit l'axe d'une face cylindrique ou plane de la 3D ([ADR 0041](https://github.com/ProtoGulix/pantin/blob/develop/docs/decisions/0041-joint-axis-from-a-picked-face.md)). Il n'est proposé que pour une liaison déjà enregistrée dont le type bouge (pas **Fixe**) ; voir [Panneaux et boutons](/reference/panels). Il marche pour les corps issus d'un STEP, qui portent des fichiers de faces ; pour un STL ou un GLB, il ne donne que la normale du triangle visé.

## Pièces achetées

Un roulement, un vérin ou un moteur du commerce arrive souvent en STEP avec des dizaines de pièces internes. **Laissez-le tel quel, en sous-assemblage** : il devient un groupe rigide, sans liaison à créer à l'intérieur. Le roulement d'une vingtaine de pièces d'un essai donne un assemblage et une seule liaison fixe vers son parent. Si ces pièces internes vous gênent dans l'arborescence, c'est un point de confort connu, pas un défaut du modèle.

Cas particulier : un composant dont une partie bouge (le vérin ci-dessus). Scindez-le en deux sous-assemblages si votre CAO le permet, sinon utilisez **Grouper…** après l'import.

## Les noms

Les noms de vos assemblages et pièces deviennent des **noms et des clés de tag** dans Pantin : la clé d'un assemblage est dérivée de son nom, rendue unique dans le Pantin, et sert de préfixe aux tags de ses liaisons (`assemblage.clé.membre`, voir [Tags](/guide/tags)). Ces tags figurent dans le programme de l'automate.

- Donnez des noms **courts et parlants** (`Tige`, `Chariot`, `Fût`) plutôt que des références (`ID1S0400125E_0:1`).
- Évitez les doublons entre assemblages frères.
- Renommez dans la CAO avant l'import plutôt qu'après : renommer un assemblage après coup change ses tags, il faut alors régénérer la GVL de l'automate.

::: warning Non vérifié
La façon dont un logiciel de CAO donné nomme les sous-assemblages et les instances dans un STEP n'est pas vérifiée pour tous les logiciels. Pantin lit le nom de l'instance d'abord, tel que le convertisseur le lit. Contrôlez les noms dans l'arborescence après l'import.
:::

## Quand le fichier ne peut pas être réorganisé

Vous n'avez pas toujours la main sur la CAO (pièce de fournisseur, fichier figé). Importez tel quel, puis structurez dans le viewer :

- **Grouper…** réunit des corps choisis dans un sous-assemblage, relié par une liaison fixe ;
- **Dégrouper** défait un groupe trop gros ou mal découpé ;
- déplacer un corps d'un assemblage à un autre corrige un rangement erroné.

Les procédures, les refus possibles et les captures d'écran sont dans [Grouper, dégrouper, déplacer un corps](/guide/groups).

## Liste de contrôle avant l'export

1. Un sous-assemblage par groupe cinématique (tout ce qui bouge ensemble est rangé ensemble).
2. Les pièces achetées sont laissées en sous-assemblage, pas éclatées dans l'assemblage de la machine.
3. Les noms d'assemblages et de pièces sont courts, parlants et sans doublon.
4. Le modèle contient des solides (pas seulement des surfaces), sans instance mise à l'échelle ni en miroir (les pièces symétriques sont de vraies pièces).
5. Les mouvements suivent si possible les axes de la CAO.
6. Format : STEP de préférence. Pour un GLB ou un STL, une pièce mobile par fichier, et notez l'unité et l'axe vertical.
7. Un GLB ou un STL est un seul corps : séparez en fichiers ce qui doit bouger séparément.

::: warning Non vérifié
Le comportement sur de très gros assemblages (plusieurs centaines de pièces) n'est pas mesuré : chaque liaison créée valide le document entier, et la conversion STEP est limitée à 2 minutes. Le trajet complet d'un logiciel de CAO donné vers Pantin avec les bons pivots n'a pas été validé sur une vraie pièce.
:::

## La suite

- [Le modèle d'un Pantin](/guide/model) : les notions de corps, d'assemblage, de groupe et de liaison.
- [Tutoriel](/guide/tutorial) : importer un modèle et l'animer pas à pas.

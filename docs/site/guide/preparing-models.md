# Préparer ses fichiers de CAO

Cette page explique comment préparer vos fichiers **dans votre logiciel de CAO, avant l'import**. Quelques minutes d'organisation à cet endroit évitent la plupart des manipulations dans le viewer. Les mots **corps**, **assemblage** et **groupe** sont définis dans [Le modèle d'un Pantin](/guide/model#les-concepts-corps-assemblage-groupe).

## La règle d'or : un sous-assemblage par groupe cinématique

**Rangez dans un même sous-assemblage tout ce qui bouge ensemble.**

Un groupe cinématique est un ensemble de pièces qui se déplacent d'un bloc. Dans un vérin, le fût est d'un côté. La tige et son embout, qui sortent et rentrent ensemble, sont de l'autre. Cela fait deux groupes, donc deux sous-assemblages :

```
Vérin                          assemblage racine
├── Fût                        sous-assemblage : reste en place
│   └── fût
└── Tige                       sous-assemblage : sort et rentre
    ├── tige
    └── embout
```

### Pourquoi

À l'import d'un STEP, chaque sous-assemblage devient un **assemblage** Pantin et chaque pièce un **corps**. Les corps d'un assemblage restent collés à lui : il n'y a aucune liaison à créer à l'intérieur.

L'import crée une liaison **Fixe** par sous-assemblage, du groupe parent au groupe enfant. Pour animer la tige, vous transformez cette liaison fixe en **Glissière**.

Si le sous-assemblage n'existe pas dans le fichier, vous le fabriquez après l'import avec **Grouper…** (voir plus bas). Le faire une fois dans la CAO est plus rapide.

Exemple : un vérin de fournisseur exporté en STEP avec trois pièces dans un seul assemblage. Pantin importe trois corps dans un seul assemblage et ne peut pas deviner que la tige bouge. Scindez l'assemblage dans la CAO (fût d'un côté, tige et embout de l'autre), ou utilisez **Grouper…** après l'import.

## Les formats

| Format | Ce que Pantin en tire | À savoir |
| --- | --- | --- |
| **STEP** (`.stp`, `.step`) | La structure est conservée : chaque sous-assemblage devient un assemblage, chaque pièce un corps. Le tout est converti en mètres. | Le format à préférer. La conversion se fait par un processus séparé et peut durer jusqu'à 2 minutes. |
| **GLB** (glTF) | Un fichier donne **un seul corps**. | Les nœuds d'un GLB ne sont pas séparés en plusieurs corps. Deux pièces qui bougent séparément doivent être deux fichiers. |
| **STL** | Un fichier donne un corps. | Pas d'unité ni de hiérarchie : le formulaire d'import demande l'**Unité**. |

### Ce que fait la conversion d'un STEP

- Chaque pièce (feuille de l'arbre) devient un corps, dans un fichier GLB en mètres, avec l'axe Z vers le haut, à la place que lui donne l'assemblage. Rien ne bouge par rapport à la CAO.
- Chaque sous-assemblage devient un assemblage, à tous les niveaux de l'arbre. Un fichier à plusieurs racines donne un assemblage portant le nom du fichier.
- Les pièces sans faces à dessiner (fils, points, géométrie de construction) sont ignorées.
- Un STEP dont une instance d'assemblage est **mise à l'échelle ou en miroir** est refusé : « The assembly "nom" is placed with a scale or a mirror, which Pantin cannot represent. Export the model without scaled or mirrored instances. » Dessinez les pièces symétriques comme de vraies pièces, sans instance en miroir, avant l'export.
- Un STEP sans aucun solide est refusé : exportez le modèle avec ses solides, pas seulement des surfaces ou un fil de fer.
- Un STEP sans sous-assemblage donne un seul assemblage portant tous les corps, sans liaison. Un GLB ou un STL donne un assemblage portant un corps.

## Unités, axe vertical et repères

- **Unités.** Un STEP et un GLB portent leur propre unité : rien à choisir. Pour un STL, le formulaire demande l'**Unité** (m, mm, cm ou pouces). Choisissez celle de votre export, sinon la pièce apparaît mille fois trop grande ou trop petite.
- **Axe vertical.** Le formulaire propose **Y vers le haut (standard glTF)** ou **Z vers le haut (CAO)** pour un GLB ou un STL. Choisissez la valeur qui correspond à votre export. Pour un STEP, l'option n'est pas proposée : un STEP converti est toujours en Z vers le haut.
- **Chaque assemblage garde son repère de CAO.** L'origine et l'axe d'une liaison sont exprimés dans le repère de l'assemblage parent. Si un vérin est monté incliné dans la machine, sa tige glisse donc le long de **son** axe, pas selon l'axe du monde.

### Placer la pièce selon les axes de la CAO

Quand c'est possible, dessinez les mouvements le long des axes de la CAO : un mouvement aligné sur X, Y ou Z se lit et se règle facilement.

Pour les autres cas, le bouton **Prendre l'axe sur une face** de la liaison lit l'axe d'une face cylindrique ou plane de la 3D. Il n'est proposé que pour une liaison déjà enregistrée dont le type bouge (pas **Fixe**) ; voir [Panneaux et boutons](/reference/panels). Pour un corps issu d'un STEP, il donne l'axe de la face. Pour un STL ou un GLB, il donne seulement la normale du triangle visé.

### Aligner le repère de chaque sous-assemblage mobile sur son mouvement

Dans votre logiciel de CAO, orientez le repère de chaque sous-assemblage **mobile** selon son mouvement : un axe le long des rails d'une glissière, ou le long de l'axe d'un pivot.

Pourquoi : l'axe par défaut d'une liaison est l'axe `[0, 0, 1]` du repère de l'assemblage parent, et c'est ce repère que le viewer affiche. Avec un repère aligné, l'axe par défaut, le gizmo **Repère local de l'assemblage** et les limites se lisent directement. Sinon, vous saisissez l'axe à la main ou le prenez sur une face, et ses nombres sont difficiles à lire.

Exemple : un chariot sur des glissières inclinées à 70°, dont le repère de sous-assemblage n'est pas incliné. L'axe de la glissière devient quelque chose comme `[0.94, 0, 0.34]` au lieu de `[0, 0, 1]`.

Si vous ne pouvez pas modifier le fichier de CAO :

1. Transformez la liaison fixe en **Glissière**, puis cliquez **Appliquer**.
2. Cliquez sur **Prendre l'axe sur une face**, puis sur une face cylindrique de la tige ou sur une face plane du rail. Cliquez **Appliquer**.
3. Cliquez sur **Aligner le repère sur cet axe**. Le repère de l'assemblage parent et celui du groupe déplacé tournent pour que l'axe se lise `[0, 0, 1]`. Rien ne bouge.

Ces boutons ne sont proposés que pour une liaison enregistrée dont le type bouge ; voir [Panneaux et boutons](/reference/panels) et [Dans quel repère se lit une liaison](/guide/model#dans-quel-repere-se-lit-une-liaison). Les autres liaisons du même parent sont réécrites aussi : groupez d'abord les rails pour garder un petit parent.

## Pièces achetées

Un roulement, un vérin ou un moteur du commerce arrive souvent en STEP avec des dizaines de pièces internes. **Laissez-le tel quel, en sous-assemblage** : il devient un groupe rigide, sans liaison à créer à l'intérieur. Un roulement d'une vingtaine de pièces donne un assemblage et une seule liaison fixe vers son parent.

Si ces pièces internes encombrent l'arborescence, cela reste un simple inconfort : le modèle est correct.

Cas particulier : un composant dont une partie bouge (le vérin ci-dessus). Scindez-le en deux sous-assemblages si votre CAO le permet, sinon utilisez **Grouper…** après l'import.

## Les noms

Les noms de vos assemblages et pièces deviennent des **noms et des clés de tag** dans Pantin. La clé d'un assemblage dérive de son nom, rendue unique dans le Pantin. Elle sert de préfixe aux tags de ses liaisons (`assemblage.clé.membre`, voir [Tags](/guide/tags)). Ces tags figurent dans le programme de l'automate.

- Donnez des noms **courts et parlants** (`Tige`, `Chariot`, `Fût`) plutôt que des références (`ID1S0400125E_0:1`).
- Évitez les doublons entre assemblages frères.
- Renommez dans la CAO avant l'import plutôt qu'après. Renommer un assemblage après coup change ses tags : il faut alors régénérer la GVL de l'automate.

Pantin lit d'abord le nom de l'instance, tel que le convertisseur le lit. Contrôlez les noms dans l'arborescence après l'import.

## Quand le fichier ne peut pas être réorganisé

Vous n'avez pas toujours la main sur la CAO (pièce de fournisseur, fichier figé). Importez tel quel, puis structurez dans le viewer :

- **Grouper…** réunit des corps choisis dans un sous-assemblage, relié par une liaison fixe ;
- **Dégrouper** défait un groupe trop gros ou mal découpé ;
- déplacer un corps d'un assemblage à un autre corrige un rangement erroné.

Les procédures, les refus possibles et les captures d'écran sont dans [Grouper, dégrouper, déplacer un corps](/guide/groups).

## Liste de contrôle avant l'export

1. Un sous-assemblage par groupe cinématique : tout ce qui bouge ensemble est rangé ensemble.
2. Les pièces achetées restent en sous-assemblage, sans être éclatées dans l'assemblage de la machine.
3. Les noms d'assemblages et de pièces sont courts, parlants et sans doublon.
4. Le modèle contient des solides (pas seulement des surfaces), sans instance mise à l'échelle ni en miroir.
5. Les mouvements suivent si possible les axes de la CAO, et le repère de chaque sous-assemblage mobile est aligné sur son mouvement.
6. Format : STEP de préférence. Pour un GLB ou un STL, une pièce mobile par fichier, et notez l'unité et l'axe vertical.

## La suite

- [Le modèle d'un Pantin](/guide/model) : les notions de corps, d'assemblage, de groupe et de liaison.
- [Tutoriel](/guide/tutorial) : importer un modèle et l'animer pas à pas.

::: warning Limites connues
- Le trajet complet d'un logiciel de CAO donné jusqu'à Pantin, avec les bons pivots, n'a pas été essayé sur une vraie pièce.
- La façon dont chaque logiciel de CAO nomme les sous-assemblages dans un STEP n'est pas connue pour tous.
- Les très gros assemblages (plusieurs centaines de pièces) n'ont pas été mesurés : chaque liaison créée valide le document entier, et la conversion STEP s'arrête après 2 minutes.
:::

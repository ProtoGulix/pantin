# CLAUDE.md : Pantin, simulateur de machines pilotées par automate

Nom du projet : Pantin (la figure articulée dont l'automate tire les ficelles). Les conventions de nommage sont en section 4.

Ce fichier est la référence du projet. Lis le en entier avant toute action. Quand une information n'est pas vérifiée, elle est marquée NON VÉRIFIÉ : ne la traite jamais comme un fait, valide la d'abord (phase 0). Il reste volontairement court : le détail vit dans docs/ et se charge à la demande.

## 1. Objectif

Un simulateur open source de machines industrielles, cinématique et un peu de physique, qu'un vrai programme d'automate pilote en boucle fermée. Cas d'usage de départ : programmes CODESYS (SoftPLC Control Win V3, cibles WAGO) validés sur une machine spéciale avant la mise en service. Public visé : amateurs d'abord, professionnels ensuite, avec une logique communautaire (les gens ajoutent leurs propres pièces sans toucher au coeur).

Exigences fortes :

1. L'utilisateur importe ses propres modèles 3D (STL, STEP, glTF) et les anime : le coeur du produit est l'animation de fichiers 3D custom.
2. Rendu beau dès le début, dans le navigateur.
3. Fonctionne en local (poste unique) et sur un serveur.
4. Le multi modèle (plusieurs machines, plusieurs IP) n'est pas un objectif de départ, mais l'architecture ne doit pas l'interdire : une machine simulée est une instance isolée.

## 2. Priorités, dans l'ordre

1. Zéro entropie : le dépôt est propre à chaque commit, pas seulement à la fin.
2. Code lisible par un humain qui découvre le projet. Le code ennuyeux et explicite gagne toujours sur le code astucieux.
3. Coeur isolé du rendu, testable sans navigateur.
4. Économie de tokens (section 6).
5. Pensé communauté : ajouter une pièce ne demande jamais de modifier le coeur.

## 3. Principes non négociables

1. Coeur headless. Le coeur de simulation ne dépend ni du navigateur ni du rendu. Il porte cinématique, physique, communications PLC, et tourne sans aucune fenêtre ouverte. C'est ce qui garantit une boucle PLC stable.
2. Viewer léger. Le navigateur affiche l'état poussé par le coeur (WebSocket, 30 à 60 Hz, interpolation côté client). Il ne contient aucune logique de simulation.
3. Une pièce est un dossier autonome. Ajouter une pièce ne doit jamais demander de modifier le coeur. Contre exemple à éviter : FactoryForge impose de toucher huit fichiers partagés par pièce, et l'Open Industry Project impose un fork custom de Godot. Ce sont les frictions qui tuent une communauté.
4. L'UI est un client de l'API. Aucun écran ne touche l'état interne du coeur, tout passe par la même API (REST plus WebSocket) que les outils en ligne de commande et les tests.
5. Tout est en fichiers texte versionnables (JSON), dans un dossier de projet compatible git.
6. Sécurité par défaut : les services écoutent sur localhost, l'ouverture réseau est un choix explicite. Aucun code communautaire n'est exécuté sans bac à sable (voir section 11).
7. Déterminisme : le coeur tourne à pas fixe, indépendant du taux d'images. Le rendu s'adapte.

## 4. Architecture

Monorepo :

    packages/protocol    schémas Zod (source de vérité), types dérivés, JSON Schema exporté. Aucune logique.
    packages/core        coeur headless (TypeScript, Node) : modèle, boucle, API, physique
    packages/viewer      viewer web (TypeScript, Vite, Babylon.js) : rendu et UI d'édition
    packages/bridge      pont vers les automates (protocoles industriels)
    packages/cli         validateur, conversion CAO, générateur de variables CODESYS
    parts/               pièces incluses (dossiers autonomes)
    examples/            projets de démonstration complets
    docs/decisions       une note courte par décision d'architecture (ADR)
    docs/spikes          rapports de vérification (phase 0)

Nommage : le projet s'appelle Pantin. Les packages sont publiés sous la portée @pantin (par exemple @pantin/protocol, @pantin/core, @pantin/viewer, @pantin/bridge, @pantin/cli) et la commande en ligne de commande est pantin. La disponibilité de ces noms sur GitHub, npm, PyPI, en nom de domaine et à l'INPI est NON VÉRIFIÉE : ne publie rien sous ce nom avant le spike correspondant (section 12).

Règle de dépendance, vérifiée en CI : protocol est importé par core, viewer, bridge et cli. core, viewer et bridge ne s'importent jamais entre eux, ils ne communiquent que par le tag bus et l'API.

Stack proposée (à confirmer en phase 0) :

1. Coeur : TypeScript sous Node. Physique : Rapier en WASM (build compat ou déterministe), utilisé uniquement pour produits, collisions et capteurs de présence. La cinématique des machines n'est PAS de la physique, elle est calculée directement.
2. Viewer : Babylon.js (Apache 2.0, PBR, inspecteur, WebGPU et WebGL2). Le viewer n'a pas besoin de Havok puisqu'il ne simule rien. La licence d'usage de Havok n'est de toute façon pas vérifiée.
3. Pont PLC : par défaut un sidecar Python (asyncua pour OPC UA, pymodbus pour Modbus TCP), qui parle au coeur via le tag bus en WebSocket. Raison : bibliothèques mûres, isolation des E/S réseau, architecture éprouvée par les projets similaires. Alternative à comparer : node-opcua et une bibliothèque Modbus Node, pour rester en un seul langage. Si Python est retenu, il suit les mêmes exigences de propreté que le TypeScript (section 8).
4. Distribution : docker compose pour le mode serveur, même code lancé en local pour les amateurs.

## 5. Modèle de données

Unités internes : mètres, radians, secondes (SI). L'UI affiche des mm et des degrés. Convention d'axes : le coeur est en Z vers le haut (comme la CAO), le viewer convertit vers le repère de Babylon.js. Ne mélange jamais les deux conventions ailleurs qu'à cette frontière.

Un projet contient des instances de pièces. Une pièce est composée de :

1. Corps (Body) : un maillage importé, avec unité et repère.
2. Liaison (Joint) : entre un corps parent (ou l'origine du monde) et un corps enfant. Elle a un repère d'origine, un axe, des limites éventuelles. Types du MVP : fixe (0 ddl), glissière (translation avec course), pivot limité (rotation avec butées), pivot continu (rotation sans limite). Plus tard : cylindrique, rotule, plane. La structure doit accepter les types futurs sans réécriture.
3. Drive (actionneur) : un pilote branché sur le degré de liberté d'une liaison. Ce n'est pas une pièce 3D. Trois modes :
   1. discret (vérin) : une ou deux bobines, deux positions de fin de course, vitesse de déplacement. Le double effet sans rappel ressort garde sa position si les deux bobines tombent.
   2. position (axe servo) : tag de consigne, vitesse et accélération maximales, tag de position réelle.
   3. vitesse (moteur, convoyeur, table) : consigne bit ou analogique, rampe, vitesse réelle en retour.
   Chaque drive expose un défaut injectable (grippé, ne répond plus).
4. Capteur (Sensor), attaché à un corps ou à un repère de la scène. Deux familles :
   1. capteurs de liaison, sans physique : détecteur de plage de position d'une liaison (fin de course), codeur d'impulsions.
   2. capteurs de présence : barrière ou rayon photoélectrique, inductif filtré par matériau, portée réglable, inversion NO ou NF, retard.
5. Produit (Product) : boîte ou pièce avec dimensions, masse, matériau, créée par un émetteur sur commande et détruite par un absorbeur. Les convoyeurs transportent les produits à la vitesse de surface (méthode de transport dans Rapier NON VÉRIFIÉE, à prototyper).
6. Tag : nom, type (bit, entier, flottant), direction vue de l'automate (commande ou retour). Le nom de l'instance est le préfixe de ses tags : instance.tag.

Exemple de manifeste de pièce (à valider contre le schéma en phase 1) :

    {
      "schema_version": 1,
      "core_compat": ">=0.1.0",
      "license": "CC-BY-4.0",
      "name": "verin_double_effet",
      "bodies": [
        { "id": "corps", "mesh": "corps.glb", "unit": "mm" },
        { "id": "tige", "mesh": "tige.glb", "unit": "mm" }
      ],
      "joints": [
        { "id": "course", "type": "prismatic", "parent": "corps", "child": "tige",
          "origin": [0, 0, 0], "axis": [1, 0, 0], "limits": [0, 0.100] }
      ],
      "drives": [
        { "id": "drv", "joint": "course", "mode": "discrete",
          "coils": { "extend": "extend", "retract": "retract" },
          "speed": 0.25, "spring_return": false }
      ],
      "sensors": [
        { "id": "ext", "kind": "joint_range", "joint": "course",
          "range": [0.098, 0.100], "tag": "extended" },
        { "id": "ret", "kind": "joint_range", "joint": "course",
          "range": [0.000, 0.002], "tag": "retracted" }
      ]
    }

Liste d'E/S : un fichier CSV maître. Il génère à la fois les variables globales CODESYS et le mapping du simulateur. Jamais de tag défini à la main à deux endroits.

## 6. Économie de tokens (obligatoire)

1. Graphify est installé dès la phase 0. Utiliser d'abord le mode AST uniquement (gratuit, sans LLM). Ne lance aucune extraction sémantique (documents, images) sans l'accord de l'utilisateur : elle consomme beaucoup de tokens.
2. Avant de lire des fichiers pour t'orienter, interroge le graphe (graphify query "..." --budget 1500, ou les commandes path et explain). Ne lis un fichier entier que si la requête ne suffit pas.
3. Après chaque lot de changements de code, mets à jour le graphe avec l'option de mise à jour incrémentale, pas de reconstruction complète.
4. Délègue toute exploration large, recherche ou revue à un subagent : seul son résumé revient dans le contexte principal.
5. Ne colle jamais dans la conversation de gros fichiers générés ni de sorties de commande complètes. Résume, ou renvoie vers le fichier.
6. Les réductions de tokens annoncées pour Graphify sont des chiffres du fournisseur, NON VÉRIFIÉS sur ce dépôt. Mesure le gain réel en phase 0 et note le dans docs/spikes.

## 7. Subagents (prérogative du projet)

Le travail se fait par délégation. L'agent principal planifie, orchestre et intègre. Il lance en parallèle les tâches indépendantes, par exemple un chantier coeur et un chantier viewer qui ne partagent que le contrat protocol. Chaque subagent reçoit les outils minimum nécessaires.

À créer en phase 0 dans .claude/agents/<nom>.md (frontmatter : name et description obligatoires, tools et model optionnels) :

1. architect : conçoit, rédige les ADR, tranche les questions de découpage. Lecture seule (Read, Grep, Glob).
2. core-dev : implémente dans packages/core, protocol et bridge. Outils de lecture et d'édition, Bash.
3. viewer-dev : implémente dans packages/viewer. Mêmes outils.
4. test-writer : écrit tests unitaires et scénarios de pièces.
5. reviewer : relit le diff contre ce fichier (lisibilité, dépendances, tests, sécurité). Lecture seule plus Bash pour lancer les vérifications, jamais d'édition.
6. researcher : spikes et vérifications externes (bibliothèques, formats). Recherche web autorisée. Rapporte des faits et signale ce qui n'a pas pu être vérifié.

Après chaque lot significatif, reviewer passe avant tout commit. Un avis négatif bloque.

## 8. Qualité du code (non négociable, coeur, viewer et pont)

Lisibilité :

1. Noms explicites et complets, en anglais dans le code, les commentaires et les commits. Pas d'abréviations obscures.
2. Fonctions courtes qui font une chose. Fichier au delà de 300 lignes : à découper. Fonction au delà de 40 lignes : à justifier.
3. Les commentaires expliquent le pourquoi, jamais le quoi.
4. Logique de domaine en fonctions pures. Effets de bord (réseau, fichiers, horloge) aux frontières et injectés.
5. Pas d'état global, pas de singleton caché, pas d'export par défaut.
6. Erreurs typées et explicites aux frontières, messages actionnables. Jamais d'exception avalée.

TypeScript : strict activé plus noUncheckedIndexedAccess. any interdit, tout cast à justifier en commentaire. Toute donnée externe (fichier, réseau, UI) passe par un schéma Zod avant d'entrer dans le domaine.

Python (si le pont Python est retenu) : ruff pour format et lint, un vérificateur de types strict (mypy ou pyright), pytest, annotations de types partout.

Hygiène :

1. Une commande unique, pnpm check, enchaîne format, lint, typecheck, tests, contrôle des frontières entre packages et détection de code mort. Elle passe avant chaque commit et en CI.
2. Aucune dépendance ajoutée sans accord explicite de l'utilisateur, avec justification et alternative envisagée.
3. Un test avec chaque comportement nouveau. Le coeur est testé en priorité sur la cinématique, les drives et les capteurs.
4. Commits petits et atomiques, format Conventional Commits. Une décision d'architecture égale un ADR.
5. Pas de TODO sans référence à un ticket, pas de code commenté, pas de fichier orphelin.

Viewer : mêmes règles. La logique d'affichage est séparée des composants d'UI, et aucun calcul de simulation ne s'y trouve.

## 9. Tag bus (protocole coeur, viewer et pont)

WebSocket JSON, versionné. Messages minimaux : abonnement à des tags, écriture d'un tag, forçage et libération d'un tag, snapshot d'état des corps (transformations) pour le viewer, événements (défaut injecté, changement de scène). La spécification complète va dans packages/protocol et docs, avant toute implémentation.

## 10. Import CAO et communications automate

Import CAO :

1. STL : pas d'unité ni de hiérarchie. L'UI demande l'unité, un fichier égale un corps.
2. STEP : peut contenir un assemblage nommé, donc proposer un découpage en corps. Le navigateur ne lit pas le STEP : conversion en maillage côté coeur via OpenCascade (bibliothèque, faisabilité et licence NON VÉRIFIÉES, à valider en phase 0).
3. glTF/GLB : chargement direct, noms de noeuds conservés, c'est le format cible du pipeline.
4. Contexte utilisateur : la CAO est ZW3D. D'après la liste de formats consultée, ZW3D exporte STEP, STL et OBJ mais pas glTF nativement (NON VÉRIFIÉ sur la version réelle). La conversion passe donc par une étape intermédiaire (FreeCAD ou Blender, à valider sur une vraie pièce).

Communications automate :

1. Cible de test : CODESYS Control Win V3 (SoftPLC livré avec l'IDE). Le mode Simulation de l'IDE coupe toute communication, il ne convient pas.
2. Modbus TCP d'abord (le plus simple à câbler), OPC UA ensuite. Deux rôles possibles pour le simulateur : client (il interroge l'automate) ou esclave (il simule des modules d'E/S que l'automate interroge, avec une IP ou un port par module). Le design doit permettre les deux. Priorité : esclave (ADR 0003).
3. Découplage : la simulation ne dépend pas du cycle de l'automate. Échanges de tags visés à 20 à 50 ms, NON VÉRIFIÉ, à mesurer en phase 0.

## 11. Communauté et sécurité

1. Une pièce est un dossier : manifest.json, le modèle (glb ou source STEP/STL), un test de scénario exécuté en CI, un README qui décrit la pièce et ses tags.
2. Chaque manifeste porte schema_version, core_compat et license (obligatoire). Le coeur fournit des migrations entre versions de schéma.
3. Neuf pièces sur dix sont des compositions de primitives : déclaratives, sans code. Le comportement scripté est optionnel et DÉSACTIVÉ par défaut en mode serveur, tant qu'un bac à sable n'existe pas. Décision de sécurité à figer par ADR avant d'ouvrir les contributions.
4. Le partage démarre par un index de packs dans un dépôt git. La signature viendra plus tard.
5. Erreurs à éviter, relevées chez les projets existants : leçons pédagogiques cachées dans le harnais de test (la documentation doit être visible), serveur Modbus qui écoute par défaut sur toutes les interfaces, coût d'ajout d'une pièce trop élevé.

## 12. Phase 0 : mise en place et spikes

Objectif : un dépôt vide mais complet, où pnpm check est vert, avant tout code métier. À exécuter dans cet ordre, en déléguant ce qui est indépendant.

Mise en place (0a) :

1. Initialiser git, le monorepo pnpm, TypeScript strict, la structure de la section 4, .gitignore, .editorconfig. Demander à l'utilisateur de choisir la licence (MIT ou Apache 2.0 recommandées).
2. Outillage qualité : Biome pour format et lint (à défaut ESLint plus Prettier), Vitest, un contrôle des frontières entre packages (dependency-cruiser ou équivalent), une détection de code mort (knip ou équivalent), hooks pré-commit (lefthook ou husky) qui lancent pnpm check, CI GitHub Actions. Vérifie les versions actuelles de chaque outil dans sa documentation avant de le figer.
3. Claude Code : créer les subagents de la section 7, configurer des hooks dans .claude/settings.json si le coût reste faible (formatage et typecheck après édition), installer Graphify pour Claude Code (sa commande d'installation dédiée) et construire le premier graphe en mode AST.
4. docs : squelette, ADR 0001 (choix de stack), ADR 0002 (schéma de descripteur).

Spikes (0b), confiés à researcher, un rapport par sujet dans docs/spikes :

1. Conversion STEP vers maillage, licence et faisabilité.
2. Rapier headless sous Node.
3. Choix du pont : Python ou Node, avec mesure.
4. Échange Modbus TCP réel avec un SoftPLC CODESYS Control Win V3, simulateur en esclave. Mesurer la configuration du port et de l'IP par module simulé.
5. Conversion ZW3D vers glTF avec pivots corrects, sur une vraie pièce de l'utilisateur (STEP avec noms conservés, fournie séparément, rangée dans private/ qui n'est jamais versionné).
6. Gain de tokens réel de Graphify sur ce dépôt.
7. Disponibilité du nom Pantin : dépôt GitHub, portée npm @pantin, nom PyPI, nom de domaine, et INPI (classes logicielles). Une recherche superficielle n'a rien remonté de pertinent, ce qui ne garantit rien. Rapport à écrire, avec l'alternative envisagée si le nom est pris (Homunculus, alias homunc, a été évoqué comme second choix).

Sortie de la phase 0 : pnpm check vert, subagents opérationnels, graphe construit, rapports de spike écrits avec ce qui a marché, échoué ou reste non vérifié.

## 13. Phases suivantes et critères de sortie

Ne passe à la phase suivante que si le critère de sortie est validé par un test automatique ou une démonstration reproductible.

1. Contrat : schémas Zod et JSON Schema (pièce, scène, mapping I/O, tag bus), validateur en ligne de commande avec erreurs lisibles. Sortie : le manifeste d'exemple est valide, un manifeste cassé produit une erreur claire.
2. Coeur cinématique : corps, quatre types de liaison, boucle à pas fixe, API, tags manuels. Sortie : un axe animé par écriture de tag, testé sans viewer.
3. Viewer : Babylon.js, chargement glTF et STL, animation depuis les snapshots, sélection d'objets. Sortie : une pièce custom de l'utilisateur s'anime correctement à l'écran.
4. Drives : discret, position, vitesse, défauts injectables. Sortie : un vérin double effet se comporte comme décrit, y compris sans rappel ressort.
5. Capteurs de liaison. Sortie : fins de course qui basculent aux bonnes positions.
6. Produits et capteurs de présence, convoyeur. Sortie : un carton traverse un convoyeur, un capteur le détecte, de façon reproductible.
7. Pont PLC : Modbus TCP puis OPC UA, générateur de variables CODESYS depuis le CSV. Sortie : un programme CODESYS réel pilote une scène en boucle fermée.
8. UI d'édition : bibliothèque de pièces, éditeur de scène, éditeur de pièce (import, choix des noeuds, type de liaison, limites, aperçu par curseurs, écriture du manifeste), mapping I/O, inspecteur avec forçage de tags. Sortie : on crée une machine complète sans éditer de fichier à la main.
9. Communauté et multi instance : index de packs dans un dépôt git, CI qui exécute un test de scénario par pièce, documentation, plusieurs instances dans un même coeur. Sortie : une pièce tierce s'installe sans modifier le coeur.

## 14. Règles de travail pour Claude Code

1. Avant chaque phase, propose un plan court et attends la validation avant d'écrire du code.
2. Écris les tests avant ou avec le code. Une phase sans critère de sortie automatisable est mal définie : signale le.
3. Ne dépasse pas le périmètre de la phase en cours. Toute idée hors périmètre va dans docs/backlog, pas dans le code.
4. Documente chaque décision d'architecture dans docs/decisions, avec l'alternative écartée.
5. Signale explicitement tout ce qui n'a pas pu être vérifié. Ne présente jamais une supposition comme un fait, et cite la source quand tu t'appuies sur de la documentation.
6. Ne modifie jamais un schéma publié sans incrémenter schema_version et fournir la migration.
7. Vérifie les versions actuelles des bibliothèques (Babylon.js, Rapier, asyncua, pymodbus, outils de qualité) dans leur documentation avant de les figer.
8. Demande l'accord de l'utilisateur avant : d'ajouter ou changer une dépendance, une licence ou un schéma public, de lancer une extraction sémantique Graphify, d'ouvrir le réseau au delà de localhost, ou de contredire un ADR existant.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

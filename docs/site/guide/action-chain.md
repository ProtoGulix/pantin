# Préactionneurs, actionneurs et capteurs

Cette page décrit la chaîne qui anime les liaisons : un **préactionneur** reçoit les commandes de l'automate, un **actionneur** déplace les liaisons, un **capteur** en lit le résultat. Les liaisons sont dans [Le modèle d'un Pantin](/guide/model#les-liaisons).

Le préactionneur et l'actionneur ne sont pas des pièces 3D. Ensemble, ils transforment une commande de l'automate en mouvement.

## Les préactionneurs

Le **préactionneur** est l'appareil que l'automate commande : distributeur, contacteur, variateur. Il porte les tags de commande et de retour. Il ne déplace rien lui-même : ses **orifices** de sortie alimentent des actionneurs.

Créez-le avec **Nouveau préactionneur** (section **Préactionneurs**) : vous donnez un **Nom**, un **Type** et l'assemblage où naissent ses tags (**Tags dans l'assemblage**).

| Type | Tags produits (direction vue de l'automate) | Orifices de sortie |
| --- | --- | --- |
| **Distributeur 3/2, monostable** | `coil_12` (commande, bit) | Orifice 2 |
| **Double distributeur 3/2** | `coil_14`, `coil_12` (commande, bit) | Orifices 2 et 4 |
| **Distributeur 5/2, monostable** | `coil_14` (commande, bit) | Orifices 2 et 4 |
| **Distributeur 5/2, bistable** | `coil_14`, `coil_12` (commande, bit) | Orifices 2 et 4 |
| **Distributeur 5/3, centre fermé** | `coil_14`, `coil_12` (commande, bit) | Orifices 2 et 4 |
| **Distributeur 5/3, centre ouvert à l'échappement** | `coil_14`, `coil_12` (commande, bit) | Orifices 2 et 4 |
| **Distributeur 5/3, centre en pression** | `coil_14`, `coil_12` (commande, bit) | Orifices 2 et 4 |
| **Contacteur** | `run` (commande, bit) | Sortie |
| **Contacteur inverseur** | `forward`, `reverse` (commande, bit) | Sortie |
| **Variateur, marche/arrêt** | `run`, `reverse` (commande, bit) ; `speed` (retour, flottant) | Sortie |
| **Variateur, consigne analogique** | `speed_setpoint` (commande) ; `speed` (retour) | Sortie |
| **Variateur d'axe asservi** | `setpoint` (commande, position) ; `position` (retour) | Sortie |

Les orifices sont typés : pneumatique, puissance ou servo. Un actionneur ne se branche que sur des orifices du bon type.

Si deux commandes contradictoires sont actives (les deux bobines d'un distributeur 5/3, marche avant et arrière d'un contacteur inverseur), l'inspecteur l'indique dans **Diagnostic**. Ce n'est pas un tag.

## Les actionneurs

L'**actionneur** lit les orifices d'un préactionneur et déplace une ou plusieurs liaisons. Il n'a **aucun tag**. Créez-le avec **Nouvel actionneur** : choisissez le **Préactionneur qui l'alimente** et les **Liaisons qu'il déplace**.

| Type | Entrées | Réglages |
| --- | --- | --- |
| **Vérin simple effet** | **Chambre fond (sortie)** | **Vitesse de sortie**, **Vitesse de rappel** |
| **Vérin double effet** | **Chambre fond (sortie)**, **Chambre tige (rentrée)** | **Vitesse de sortie**, **Vitesse de rentrée** |
| **Moteur alternatif** | **Alimentation** | **Vitesse nominale** |
| **Servomoteur** | **Entrée servo** | aucun |

Une liaison est déplacée par un seul actionneur. Un actionneur déplace des liaisons mobiles, toutes dans la même unité (mètres ou radians). L'application refuse un préactionneur qui ne peut pas alimenter toutes les entrées de l'actionneur.

Un menu sur une liaison offre aussi **Ajouter un actionneur…**.

## Les capteurs

Un **capteur** surveille une liaison (**Liaison surveillée**) et donne son état à l'automate par ses tags. Il ne simule pas de physique. Créez-le avec **Nouveau capteur**, ou depuis le menu d'une liaison par **Ajouter un capteur…** ou **Ajouter les fins de course**.

| Type | Tag (retour) |
| --- | --- |
| **Contact idéal** | `state` (bit) |
| **Fin de course mécanique** | `state` (bit) |
| **Détecteur de vérin (magnétique)** | `state` (bit) |
| **Détecteur inductif (axial)** | `state` (bit) |
| **Codeur** | `count` (entier, comptage d'impulsions) |

Les détecteurs offrent entre autres l'option **Normalement fermé**, qui inverse le contact. Le détecteur inductif tient compte de la **Matière de la cible** pour sa portée réelle.

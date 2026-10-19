# Produits et convoyage

Cette page décrit les objets qui transportent et détectent des produits. Ils s'appuient sur la chaîne d'action : voir [Préactionneurs, actionneurs et capteurs](/guide/action-chain).

Les objets de convoyage se créent depuis la famille **Convoyage** de l'arborescence (**Nouvelle bande**, **Nouveau guide**, **Nouvel émetteur**, **Nouvel absorbeur**, **Nouvelle cellule de présence**). Ils demandent d'abord un assemblage.

| Objet | Rôle |
| --- | --- |
| **Bande** | surface de convoyeur droite (**Longueur** par **Largeur**), entraînée par un **Tambour (liaison pivot continu)** de **Rayon du tambour** donné |
| **Guide** | boîte que les produits ne traversent pas (rail latéral, butée) |
| **Émetteur** | crée une boîte (**Masse**, **Matériau**) quand le tag `spawn` passe à 1 |
| **Absorbeur** | détruit les produits dont le centre entre dans son volume |
| **Cellule de présence** | détecte les produits par un rayon, au lieu de surveiller une liaison |

Le produit n'est jamais enregistré : il n'existe que pendant que le cœur tourne. Le bouton **Créer un produit** de l'émetteur écrit 1 puis 0 sur son tag `spawn`.

Dans la vue 3D, les volumes sont des gris neutres qui suivent le thème. Un émetteur est une boîte en contour avec un signe **+**, un absorbeur une boîte en contour avec un signe **−** (les signes font toujours face à vous et gardent une taille lisible), un guide une boîte presque pleine gris acier. Les gris ne diffèrent que par la clarté : ce sont les signes et les formes qui distinguent les trois.

La chaîne d'une bande est : un préactionneur (par exemple un **Contacteur**) alimente un actionneur (par exemple un **Moteur alternatif**), qui déplace la liaison du tambour, que la bande nomme.

| Tag | Propriétaire | Direction |
| --- | --- | --- |
| `spawn` | émetteur | commande (bit) |
| `state` | cellule de présence | retour (bit) |

La **Cellule photoélectrique** a deux modes, **Réflex** et **Barrage**, une **Portée**, **Normalement fermé**, et deux retards (**Retard à l'enclenchement**, **Retard au déclenchement**). Elle lance son rayon le long de l'axe Z de son repère.

Les bandes, guides et absorbeurs n'ont pas de tag.

::: warning Limites connues
Seule la bande droite est prise en charge. Les convoyeurs courbes, les rouleaux et les transferts entre bandes ne sont pas proposés. Les produits sont des boîtes.
:::

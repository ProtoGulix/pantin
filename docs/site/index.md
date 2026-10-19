---
layout: home
hero:
  name: Pantin
  text: Un simulateur de machines pilotées par automate
  tagline: Importez vos modèles 3D, animez-les, et faites-les piloter par votre vrai programme d'automate avant la mise en service.
  image:
    light: /pantin-symbol.svg
    dark: /pantin-symbol-dark.svg
    alt: Pantin
  actions:
    - theme: brand
      text: Découvrir
      link: /guide/fundamentals
    - theme: alt
      text: Préparer ma CAO
      link: /guide/preparing-models
    - theme: alt
      text: Brancher mon automate
      link: /guide/connect-a-plc
features:
  - title: Vos modèles 3D, animés
    details: Importez vos fichiers STEP, STL ou glTF, rangez-les en corps et en groupes, puis reliez-les par des liaisons (glissière, pivot...). Aucun fichier à écrire à la main.
    link: /guide/fundamentals
    linkText: Les fondamentaux
  - title: Un vrai automate, en boucle fermée
    details: L'automate écrit ses commandes et lit les capteurs simulés en Modbus TCP. L'exemple du dépôt se pilote depuis CODESYS dans les deux sens.
    link: /guide/connect-a-plc
    linkText: Connecter un automate
  - title: Sur votre poste ou sur le réseau local
    details: Pantin écoute par défaut sur votre machine seule. Ouvrir le réseau est un choix explicite, limité au réseau local privé.
    link: /guide/fundamentals#local-par-defaut
    linkText: Réseau et sécurité
  - title: Lisible sans distinguer les couleurs
    details: Chaque information portée par une couleur l'est aussi par une forme, un symbole ou un texte. La légende des repères est dans la référence.
    link: /reference/colours
    linkText: Lire les couleurs et les repères
  - title: Un Pantin, c'est un dossier
    details: Une machine est un dossier de fichiers texte. On le versionne avec git, on le copie, on le partage.
    link: /guide/tutorial
    linkText: Le tutoriel
---

<div class="home-shot-wrapper">
  <img class="home-shot home-shot--light" src="/screenshots/fr/home-light.webp" alt="Le viewer de Pantin avec l'exemple d'un vérin, thème clair">
  <img class="home-shot home-shot--dark" src="/screenshots/fr/home-dark.webp" alt="Le viewer de Pantin avec l'exemple d'un vérin, thème sombre">
</div>

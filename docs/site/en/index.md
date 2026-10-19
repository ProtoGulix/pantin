---
layout: home
hero:
  name: Pantin
  text: A simulator for machines driven by a PLC
  tagline: Import your 3D models, animate them, and have your real PLC program drive them before commissioning.
  image:
    light: /pantin-symbol.svg
    dark: /pantin-symbol-dark.svg
    alt: Pantin
  actions:
    - theme: brand
      text: Discover
      link: /en/guide/fundamentals
    - theme: alt
      text: Prepare my CAD
      link: /en/guide/preparing-models
    - theme: alt
      text: Connect my PLC
      link: /en/guide/connect-a-plc
features:
  - title: Your 3D models, animated
    details: Import your STEP, STL or glTF files, file them as bodies and groups, then link them with joints (slider, pivot...). No file to write by hand.
    link: /en/guide/fundamentals
    linkText: The fundamentals
  - title: A real PLC, in a closed loop
    details: The PLC writes its commands and reads the simulated sensors over Modbus TCP. The example of the repository is driven from CODESYS in both directions.
    link: /en/guide/connect-a-plc
    linkText: Connect a PLC
  - title: On your computer or the local network
    details: By default Pantin listens on your machine only. Opening the network is an explicit choice, limited to the private local network.
    link: /en/guide/fundamentals#local-by-default
    linkText: Network and security
  - title: Readable without telling colours apart
    details: Every piece of information carried by a colour is also carried by a shape, a symbol or a text. The legend of the cues is in the reference.
    link: /en/reference/colours
    linkText: Reading colours and cues
  - title: A Pantin is a folder
    details: A machine is a folder of text files. You version it with git, copy it, share it.
    link: /en/guide/tutorial
    linkText: The tutorial
---

<div class="home-shot-wrapper">
  <img class="home-shot home-shot--light" src="/screenshots/en/home-light.webp" alt="The Pantin viewer with a cylinder example, light theme">
  <img class="home-shot home-shot--dark" src="/screenshots/en/home-dark.webp" alt="The Pantin viewer with a cylinder example, dark theme">
</div>

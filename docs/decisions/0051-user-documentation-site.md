# 0051. User documentation site with VitePress

- Status: accepted
- Date: 2026-10-15

## Context

The documentation in `docs/` addresses contributors: ADRs, spikes, and guides
to add a type. Nothing explains Pantin to a user who wants to model a machine
and drive it from a PLC, and nothing exists in French, the language of the
first users. The user asked for a real documentation, in French and English,
on the fundamentals and on how to model a Pantin, published under a domain
they own: `pantin.frezille.fr/docs`.

The repository already uses pnpm, Vite and Markdown. GitHub Pages serves a
public repository for free, on a custom domain with an automatic certificate
(https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site).

## Decision

1. The user documentation is a VitePress site in `docs/site/`, in Markdown:
   French at the root, English under `en/`, with the same file names in both
   so that the language switch lands on the same page. VitePress 1.6.4 is a
   root dev dependency (MIT, latest stable on 2026-10-15; 2.0 is alpha).
2. The site is built with `base: "/docs/"`, so that it is served at
   `pantin.frezille.fr/docs/` and the root of the subdomain stays free for a
   landing page, downloads or the pack index of phase 9.
3. The pages describe what the code does today. What is not verified (a real
   CODESYS program, ZW3D export) is written as such. The ADRs and the guides
   for contributors stay where they are; the site links to them rather than
   copying them.
4. Publication goes through a GitHub Actions workflow that builds the site
   from `master` only and deploys it to GitHub Pages. With a custom Actions
   workflow, GitHub ignores a `CNAME` file: the domain `pantin.frezille.fr` is
   set in the repository's Pages settings
   (https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).
   The workflow is written disabled (manual trigger only) and switched on by
   the user, after the manual trademark search that spike 0004 leaves open: a
   public site is a public use of the name.
5. `pnpm docs:dev`, `pnpm docs:build` and `pnpm docs:preview` run the site
   locally. The site is not part of `pnpm check`: it holds no code under test.

## Rejected alternatives

- Plain Markdown in the repository only: readable on GitHub, but no search,
  no language switch, no navigation for a newcomer.
- Starlight (Astro): equally suited, with good translation support, but it
  adds Astro to a stack that already has Vite.
- Docusaurus: heavier, built on React, which the project does not use.
- MkDocs Material: Python, which the project has; its maintenance status was
  not checked (NOT VERIFIED), and a second documentation toolchain in Python
  would split the front-end tooling.
- GitHub wiki: outside the repository, so no review, no CHANGELOG, and the
  documentation drifts from the code.

## Consequences

- A behaviour change in the viewer or the core must update the pages that
  describe it, in both languages; the reviewer checks it.
- VitePress 1.6.4 brings its own Vite 5 and esbuild, separate from the
  viewer's Vite 8. esbuild's install script is not allowed: its platform
  binary comes from an optional dependency.
- The DNS record (`pantin CNAME protogulix.github.io.`), the domain
  verification on GitHub, the Pages source set to "GitHub Actions" and the
  custom domain in the repository's Pages settings are the user's actions.
- Screenshots are not in this first version; when added, they must be
  regenerated when the interface changes.

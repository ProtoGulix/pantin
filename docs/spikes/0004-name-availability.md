# Spike 0004. Name availability: Pantin (fallback Homunculus / homunc)

- Date: 2026-09-28 (all checks run that day, unauthenticated, from one IP)
- Scope: CLAUDE.md section 12, spike 7. Nothing was registered or created.

## Question

Can the project publish as "Pantin": GitHub organisation, npm scope `@pantin`
and CLI `pantin`, PyPI name, a domain, and without clashing with a trademark in
software classes (Nice 9 and 42)? Same quick check for the fallback name.

## Verdict

**Usable with one gap, trademark status unknown.** npm (scope and unscoped
name), PyPI and several domains look free. The GitHub name `pantin` is
**taken** by a dormant organisation (a personal account, 1 repo, last update
2018), so the repo must live under another owner or org name
(e.g. `pantin-sim`, not checked). Trademark databases could not be queried
automatically: NOT VERIFIED, and that is the main open risk. Search noise from
the commune of Pantin is high.

## Results

| Item | Status | Source / evidence |
|---|---|---|
| GitHub org/user `pantin` | taken | https://api.github.com/orgs/pantin : org "Pantin", created 2018-02-27, updated 2018-07-09, "Poly Pantin personal projects", 1 repo (`pantin.io`, 0 stars) |
| GitHub repos named pantin | low confusion | https://api.github.com/search/repositories?q=pantin+in:name : 204 hits, top ones tiny. `skarab42/pantin` (Rust, 1 star, pushed 2026-04-23, Firefox screenshot microservice, CLI `pantin_server`); `LesFeesSpeciales/rigify-pantins` (Blender, 10 stars) |
| npm scope `@pantin` (org) | free | https://registry.npmjs.org/-/org/pantin/package : 404 "Scope not found" |
| npm `@pantin/core`, `/protocol`, `/cli` | free | https://registry.npmjs.org/@pantin%2fcore (and others): 404 |
| npm unscoped `pantin` | free | https://registry.npmjs.org/pantin : 404; search `text=pantin` returns 0 packages |
| npm user `pantin` (would also own the scope) | unclear | user endpoint needs auth (401); www.npmjs.com/~pantin returned 403 to curl |
| PyPI `pantin` | free | https://pypi.org/pypi/pantin/json : 404 |
| pantin.dev | free (likely) | DNS NXDOMAIN; https://rdap.org/domain/pantin.dev : 404 |
| pantin.io | free (likely) | DNS NXDOMAIN; RDAP 404 (it was the 2018 GitHub org's site, now lapsed) |
| pantin.app | free (likely) | DNS NXDOMAIN; RDAP 404 |
| pantin-sim.dev, pantinsim.dev, getpantin.dev | free (likely) | DNS NXDOMAIN; RDAP 404 |
| pantin.org | taken | https://rdap.publicinterestregistry.org/rdap/domain/pantin.org : registered 2022-05-18, OVH |
| pantin.fr | taken | https://rdap.nic.fr/domain/pantin.fr : registrant "commune de pantin", since 2004 |
| pantin.com | taken | https://rdap.verisign.com/com/v1/domain/pantin.com : registered 1995, GoDaddy, expires 2026-10-15 |
| pantin.net | taken | DNS NOERROR, RDAP 200 |
| Trademark PANTIN, classes 9/42 | unclear | see NOT VERIFIED |
| Commune of Pantin (93) | noise risk | https://en.wikipedia.org/wiki/Pantin_(disambiguation); INPI company records "PANTIN", "PANTIN DISTRIBUTION" etc. (data.inpi.fr/entreprises/...) |
| Fallback: GitHub `homunculus` | taken | https://api.github.com/users/homunculus : user, 0 public repos, created 2010 |
| Fallback: GitHub `homunc` | taken | https://api.github.com/users/homunc : user, 0 public repos, created 2013 |
| Fallback: GitHub repos | confusing | `humanplane/homunculus` (394 stars, a Claude Code plugin, pushed 2026-01-23), `not-elm/desktop-homunculus` (84 stars) |
| Fallback: npm `homunculus` | taken | https://registry.npmjs.org/homunculus : v1.6.8, lexer/parser (army8735) |
| Fallback: npm scope `@homunculus` | taken | https://registry.npmjs.org/-/org/homunculus/package : 200 `{}` (scope exists, no public packages) |
| Fallback: npm `homunc`, scope `@homunc` | free | registry 404 / "Scope not found" |
| Fallback: PyPI `homunculus` | taken | https://pypi.org/pypi/homunculus/json : 0.0.0b0 placeholder (Daniel Knell) |
| Fallback: PyPI `homunc` | free | https://pypi.org/pypi/homunc/json : 404 |
| Fallback: homunc.dev, homunc.io | free (likely) | DNS NXDOMAIN; RDAP 404 |
| Fallback: homunculus.dev | taken | DNS NOERROR, Cloudflare nameservers |

Note on domains: NXDOMAIN plus RDAP 404 strongly suggests "not registered",
but only a registrar availability check at purchase time is conclusive
(reserved or premium names, pending deletes). `whois` is not installed; RDAP
was used instead.

## NOT VERIFIED

- **Trademarks "PANTIN" in Nice classes 9 and 42 (FR, EU, international).**
  - data.inpi.fr brand search: HTTP 403 to automated fetch.
  - WIPO Global Brand Database (branddb.wipo.int): CAPTCHA (Altcha), no results.
  - EUIPO eSearch: JavaScript app, no results rendered.
  - TMview (tmdn.org) API: connection failed.
  - Web search for "PANTIN" trademark software found nothing relevant, which
    proves nothing. A manual search is required on https://data.inpi.fr
    (Marques), https://www.tmdn.org/tmview and https://branddb.wipo.int,
    classes 9 and 42, including similar marks (PANTINS, PANTYN).
- Also: whether a geographic name like a commune can be registered or opposed
  as a mark (French law protects local authorities' names against harmful
  use); not assessed, legal advice territory.
- Whether an npm *user* named `pantin` exists (would block the scope as an org).
  Only certain once the org is created.
- Same trademark gap for "Homunculus" / "homunc".
- GitHub alternative org names (`pantin-sim`, `pantin-dev`, ...): not checked.

## Recommendation

1. Keep "Pantin" provisionally: npm `@pantin` and `pantin`, PyPI `pantin` and
   pantin.dev / pantin.app are free today. If the user confirms the name,
   reserve the npm org and PyPI name early (user action, not done here).
2. GitHub: `github.com/pantin` is taken (dormant). Choose another org
   (e.g. `pantin-sim`) or ask GitHub for the dormant name (name squatting
   policy; outcome uncertain). The repo name `pantin` under that org is fine.
3. Before any public release, the user runs the manual trademark search above
   (INPI, TMview, WIPO) in classes 9 and 42. This is the only blocker left.
4. Accept search noise from the commune; mitigate with a qualified tagline
   ("Pantin, machine simulator") and a distinct domain (pantin.dev).
5. Fallback: "Homunculus" is worse (GitHub, npm, npm scope and PyPI taken,
   plus a 394-star Claude Code plugin of the same name). "homunc" is free on
   npm and PyPI but taken on GitHub; weak as a fallback. Consider looking for
   a third candidate only if the trademark search blocks Pantin.

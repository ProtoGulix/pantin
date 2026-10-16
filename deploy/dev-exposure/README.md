# Development exposure (ADR 0014)

Publishes the Pantin of the development machine on `pantin-dev.frezille.fr`,
through the existing Cloudflare tunnel and the local nginx. The core keeps
listening on 127.0.0.1 only.

Do the steps in this order: the subdomain must never be reachable without
the Access policy.

## 1. Cloudflare Access (dashboard, Zero Trust)

Access → Applications → Add an application → Self-hosted:

- application domain: `pantin-dev.frezille.fr`;
- policy: action Allow, include "Emails" with your address only;
- login method: one-time PIN;
- no other policy (no Bypass, no Everyone), and an empty path so that the
  whole host is covered.

## 2. nginx (on the machine)

```sh
sudo cp deploy/dev-exposure/pantin-dev.nginx.conf /etc/nginx/sites-available/pantin-dev
sudo ln -s /etc/nginx/sites-available/pantin-dev /etc/nginx/sites-enabled/pantin-dev
sudo nginx -t && sudo systemctl reload nginx
```

The site also answers 403 for the tag bus (`/api/pantins/<id>/bus`, ADR 0046
point 7) and marks every proxied request with `X-Pantin-Exposure: cloudflare`,
which the core refuses on a bus upgrade. To update an installed site, copy the
file again over `/etc/nginx/sites-available/pantin-dev` and run the last line
of the block above.

## 3. Public hostname of the tunnel (dashboard)

Zero Trust → Networks → Tunnels → the machine's tunnel → Public Hostname →
Add: subdomain `pantin-dev`, domain `frezille.fr`, service
`HTTP` `localhost:80` (the same target as tunnel-dev).

## 4. Start Pantin

```sh
pnpm serve
```

Then open https://pantin-dev.frezille.fr: Cloudflare asks for the code sent
by email, then the viewer opens.

## 5. The user guide under /docs/ (optional, ADR 0051)

nginx runs as `www-data` and cannot read the home directory, so the built
guide is copied to `/var/www/pantin-dev/docs/`. Once, give that folder to
your user:

```sh
sudo install -d -o "$USER" -g "$USER" /var/www/pantin-dev/docs
```

If the nginx site was installed before this section existed, copy it again
and reload nginx (section 2). Then, after each change of the guide, without
sudo:

```sh
pnpm docs:build
find /var/www/pantin-dev/docs -mindepth 1 -delete
cp -r docs/site/.vitepress/dist/. /var/www/pantin-dev/docs/
chmod -R u=rwX,go=rX /var/www/pantin-dev/docs
```

The `chmod` keeps the files readable by `www-data` whatever your umask; plain
`cp` because rsync is not installed on every machine.

https://pantin-dev.frezille.fr/docs/ serves it behind the same Access policy
as the viewer. The core does not need to run for it.

## 6. Check the barriers

- In a private browser window, https://pantin-dev.frezille.fr and
  https://pantin-dev.frezille.fr/docs/ must show the Cloudflare Access login,
  never the viewer or the guide.
- From another machine of the LAN, this must answer 403:

  ```sh
  curl -i -H 'Host: pantin-dev.frezille.fr' -H 'X-Forwarded-Proto: https' http://<machine address>/api/pantins
  curl -i -H 'Host: pantin-dev.frezille.fr' -H 'X-Forwarded-Proto: https' http://<machine address>/docs/
  ```

- The tag bus must not be reachable through the exposure. Run this on the
  machine (it goes through nginx, with the exposure's Host name):

  ```sh
  curl -i -H 'Host: pantin-dev.frezille.fr' -H 'X-Forwarded-Proto: https' \
    -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
    http://127.0.0.1/api/pantins/<any id>/bus
  ```

  It must answer `403 Forbidden`, never `101 Switching Protocols`. Repeat it
  with `/bus/` at the end of the path: same answer. Nothing else the
  exposure serves uses WebSockets (the viewer uses SSE), so the site forwards
  no `Upgrade` header.

## Remove the exposure

Delete the public hostname in the tunnel first, then the Access application,
then `/etc/nginx/sites-enabled/pantin-dev` and reload nginx, and
remove the guide's copy (`sudo rm -r /var/www/pantin-dev`).

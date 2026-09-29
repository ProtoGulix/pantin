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

## 5. Check the barriers

- In a private browser window, https://pantin-dev.frezille.fr must show the
  Cloudflare Access login, never the viewer.
- From another machine of the LAN, this must answer 403:

  ```sh
  curl -i -H 'Host: pantin-dev.frezille.fr' -H 'X-Forwarded-Proto: https' http://<machine address>/api/pantins
  ```

## Remove the exposure

Delete the public hostname in the tunnel first, then the Access application,
then `/etc/nginx/sites-enabled/pantin-dev` and reload nginx.

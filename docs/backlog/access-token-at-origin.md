# Check the Cloudflare Access token at the origin

Today the development exposure (ADR 0014) relies on the Access policy and on
nginx accepting loopback connections only. Before any shared or longer-lived
exposure, verify the `Cf-Access-Jwt-Assertion` header at the origin
(signature against the team's public keys, audience of the application),
for example with an nginx `auth_request` to a small checker, so that a
misconfigured tunnel or policy cannot open the API.

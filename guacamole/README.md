# Guacamole gateway (virtual computers feature)

Streams VNC/RDP sessions for the "virtual computers" feature into the app's
browser UI. `guacd` (the actual protocol proxy) + `guacamole` (the HTML5 web
client) run as the official images, unmodified -- both are configured
entirely via env vars. `guacamole` already bundles the JSON auth extension,
which is what lets the Next.js server mint signed, short-lived connection
tokens without a separate Guacamole user database -- see `../lib/guacamole.ts`.

Deployed to Fly.io as two apps (`niksenflow-guacd`, `niksenflow-guacamole`)
in the same org, reachable from each other over Fly's private 6PN network --
see `fly.guacd.toml` / `fly.guacamole.toml`.

## Local dev

```bash
cp guacamole/.env.example guacamole/.env
# edit guacamole/.env: GUACAMOLE_JSON_SECRET_KEY=$(openssl rand -hex 16)
docker compose -f guacamole/docker-compose.yml --env-file guacamole/.env up -d
```

Web client at `http://localhost:8080/guacamole`. Set on the Next.js app's
`.env.local`:

```
GUACAMOLE_URL=http://localhost:8080/guacamole
NEXT_PUBLIC_GUACAMOLE_URL=http://localhost:8080/guacamole
GUACAMOLE_JSON_SECRET_KEY=<same value as guacamole/.env>
```

## Production (Fly.io)

Vercel can't run this (needs a persistent `guacd` process, not a serverless
function).

```bash
fly apps create niksenflow-guacd
fly deploy -c guacamole/fly.guacd.toml -a niksenflow-guacd

fly apps create niksenflow-guacamole
fly secrets set -a niksenflow-guacamole JSON_SECRET_KEY=$(openssl rand -hex 16)
fly deploy -c guacamole/fly.guacamole.toml -a niksenflow-guacamole
```

Then on the Next.js app (Vercel), set:

```
GUACAMOLE_URL=https://niksenflow-guacamole.fly.dev/guacamole
NEXT_PUBLIC_GUACAMOLE_URL=https://niksenflow-guacamole.fly.dev/guacamole
GUACAMOLE_JSON_SECRET_KEY=<same value passed to JSON_SECRET_KEY above>
```

Deploying to a different host (Railway, a VPS)? Same two containers,
`guacamole/docker-compose.yml` is the reference -- just make sure `guacd` is
reachable from the `guacamole` container on port 4822 and put TLS in front
of Guacamole's port 8080; the web client and the tokens minted by
`lib/guacamole.ts` should never be served over plain HTTP outside local dev.

## How the JSON auth extension works

No Postgres/MySQL and no Guacamole user accounts are needed. Instead:
`lib/guacamole.ts` builds a payload naming the target VM's protocol
(vnc/rdp), hostname, and credentials, signs + encrypts it with
`GUACAMOLE_JSON_SECRET_KEY` per Guacamole's documented algorithm
(https://guacamole.apache.org/doc/gug/json-auth.html -- HMAC-SHA256 sign,
prepend signature, AES-128-CBC encrypt with an all-zero IV, base64 encode),
and POSTs it to `${GUACAMOLE_URL}/api/tokens`. Guacamole verifies the
signature (via `JSON_SECRET_KEY`, which must be set to the same value) and
issues a normal auth token scoped to just that one connection, which the
browser then uses to open the session.

# Deploying a remote instance

The default `npx drupalorg-mcp` server speaks stdio, for local MCP clients only. This document covers running a **hosted, HTTP-based instance** so it can be added to claude.ai (Settings → Connectors → Add custom connector) or any other client that supports remote MCP servers.

## Why there's no OAuth

Remote MCP servers commonly sit behind an OAuth proxy (e.g. [gitlab-mcp's `mcp_oauth_proxy`](https://github.com/zereight/gitlab-mcp#using-mcp-oauth-proxy-gitlab_mcp_oauth)) because they call an API *on behalf of a specific user* and need to exchange/store that user's token. drupalorg-mcp wraps drupal.org's **api-d7**, which is anonymous and public — there's no per-user identity or credential involved anywhere in the request path. Adding OAuth here would protect nothing; it would just add a login flow in front of data anyone can already fetch unauthenticated.

That means the hosted endpoint below is **intentionally open**: anyone with the URL can call it. There's no credential to leak and nothing user-specific to isolate — the only downside is someone else consuming your drupal.org API quota/bandwidth, which just surfaces as slower responses or upstream errors, not a security incident.

## 1. Build and run the container

This repo includes a `Dockerfile` (runs `http-server.js`, a stateless Streamable HTTP transport, on port 3000 with a `GET /health` check) and a `docker-compose.yml`.

The compose file expects an **external Docker network** shared with your Traefik instance, so Traefik can reach this container by service name without publishing a host port. Update `docker-compose.yml`:

- `networks.edge` → the actual network name your Traefik compose project uses. Find it with `docker network ls`, or add an explicit shared network to the Traefik compose file if it doesn't already declare one, e.g.:
  ```yaml
  networks:
    default:
      name: edge
  ```

The domain and Traefik entrypoint/certresolver names aren't hardcoded in `docker-compose.yml` — they're `${VAR}` references, filled in from `.env` (which `docker compose` auto-loads for interpolation, on top of injecting it into the container via `env_file:`). Copy the template and fill in your values:

```bash
cp .env.example .env
```

```bash
# .env
DOMAIN=mcp.yourdomain.tld           # your real domain
TRAEFIK_ENTRYPOINT=websecure        # your HTTPS entrypoint name, if different
TRAEFIK_CERTRESOLVER=letsencrypt    # your certresolver name
```

`.env` is gitignored — it's host-specific config, not a secret (no credentials involved, see above), but keeping it out of git avoids the domain landing in commit history, and lets `docker-compose.yml` stay identical across deployments.

`MCP_ALLOWED_HOSTS` (Host-header validation on the server itself) is derived from `DOMAIN` automatically in the compose file — no separate var to set.

Then:

```bash
docker compose up -d --build
```

## 2. Traefik routing

No extra config file to edit — the `traefik.*` labels in `docker-compose.yml` are the routing config; Traefik picks them up automatically via the Docker provider on `docker compose up`. Just confirm:

- Traefik's Docker provider is enabled (`--providers.docker=true`) and, if `exposedByDefault=false` (common, safer default), that `traefik.enable=true` is set — it already is, in the label block above.
- The container is actually on `edge` (or whatever you renamed it to) — Traefik only discovers containers reachable on a network it's also attached to.

## 3. DNS

Point `mcp.yourdomain.tld` (A/AAAA) at the server before starting the container — if your certresolver uses HTTP-01/TLS-ALPN challenges, Traefik needs the domain resolvable to issue the cert on first request.

## 4. Verify

```bash
curl -s https://mcp.yourdomain.tld/health
# ok

curl -s -X POST https://mcp.yourdomain.tld/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"0"}}}'
# valid initialize response
```

## 5. Add to claude.ai

Settings → Connectors → Add custom connector → URL: `https://mcp.yourdomain.tld/mcp`. No OAuth client ID/secret needed — leave those fields blank.

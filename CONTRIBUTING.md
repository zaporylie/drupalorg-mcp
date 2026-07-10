# Contributing

Single-file MCP server (`index.js`) wrapping drupal.org's public api-d7 REST API. No build step.

## Development

```bash
npm install
node --check index.js   # syntax check
node index.js            # run directly over stdio
```

There's no test suite yet — verify changes against the live API with `curl` before wiring them into a tool handler (see notes below on api-d7 quirks).

## Structure

- `d(path, params)` — thin fetch wrapper for `api-d7`, appends `.json`, sets the `UA` header.
- `getProjectMaintainers(machineName)` — hits `/project/<machine_name>/maintainers.json`, which lives *outside* api-d7 and has a different response shape (`{ "<uid>": { name, permissions } }`).
- `decorateIssue()` — maps numeric field codes (status/priority/category) to human labels via the `ISSUE_*` lookup tables.
- `resolveProjectNid()` / `resolveUserUid()` — machine_name/username -> id, both cached in-memory.
- `resolveAuthorArg()` — resolves the `author`/`username`/`owner` args accepted by several tools: literal username, numeric uid, or `"me"` (needs `DRUPALORG_USERNAME` env var).
- Tools are registered in the `TOOLS` array and dispatched in the `CallToolRequestSchema` handler — keep both in sync when adding a tool.

## Known api-d7 quirks (verified against the live API)

- The `type` filter does **not** accept comma-separated OR lists (`type=project_module,project_theme` returns 0 results). `list_my_projects` / `find_maintained_projects` work around this by firing one request per type in `PROJECT_TYPES` and merging.
- There is no user→projects "maintainer" endpoint. Only project→maintainers (`/project/<machine_name>/maintainers.json`) exists. `find_maintained_projects` fakes a reverse lookup by scanning every project authored by a given `owner` — it does not (and cannot) search all of drupal.org.
- Project node type is `project_module`, `project_theme`, `project_distribution`, `project_core`, or `project_general` (recipes and other non-code projects use this last one — added after a real recipe project didn't show up in results).

## Adding a tool

1. Add the schema to the `TOOLS` array.
2. Add the matching branch in the `CallToolRequestSchema` handler.
3. Return `{ content: [{ type: "text", text: ... }] }`; on error return the same shape with `isError: true` and an `Error: ` prefix — don't let raw exceptions cross the MCP boundary.
4. Sanity-check the underlying api-d7 query with `curl` first — the API has undocumented edge cases (see above).
5. Update `README.md`'s tool list.

## Publishing (maintainers)

`files` in `package.json` restricts the published tarball to `index.js` (plus npm's always-included `package.json`, `README.md`, `LICENSE`).

Publishing is automated: `.github/workflows/publish.yml` runs on any pushed tag matching `v*`, checks the tag matches `package.json`'s version, then runs `npm publish`.

Before tagging, add an entry to `CHANGELOG.md` for the new version.

```bash
npm pack --dry-run     # sanity-check what would be published
npm version patch|minor|major   # bumps package.json and creates a git tag
git push --follow-tags          # pushing the vX.Y.Z tag triggers the workflow
```

One-time setup uses [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers) (OIDC) — no long-lived token stored in GitHub:

1. Publish `0.1.0` manually once (`npm publish --access public`) so the package exists on npm.
2. On npmjs.com: package page → Settings → Trusted Publisher → add GitHub Actions, pointing at `zaporylie/drupalorg-mcp`, workflow file `publish.yml`.
3. Done — the workflow's `id-token: write` permission lets it mint a short-lived OIDC token that npm exchanges for publish rights on that one workflow only. No `NPM_TOKEN` secret needed.

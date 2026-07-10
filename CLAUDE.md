# drupalorg-mcp

Single-file MCP server (`index.js`) wrapping drupal.org's public api-d7 REST API. Read-only, no auth. Published to npm as `drupalorg-mcp` (see CONTRIBUTING.md for release flow).

## Structure
- All logic lives in `index.js` — no build step, no src/ dir. Keep it that way unless it grows past ~2 files worth.
- `d(path, params)` — thin fetch wrapper for api-d7, appends `.json`, sets UA header.
- `getProjectMaintainers(machineName)` — hits `/project/<machine_name>/maintainers.json`, which lives *outside* api-d7 and has a different response shape (`{ "<uid>": { name, permissions } }`).
- `decorateIssue()` — maps numeric field codes (status/priority/category) to human labels via the `ISSUE_*` lookup tables.
- `resolveProjectNid()` — machine_name -> nid, cached in-memory (`projectNidCache`). Most drupal.org API calls need the numeric project id, not the machine name.
- `resolveUserUid()` — username -> uid, cached in-memory (`userUidCache`).
- `resolveAuthorArg()` — resolves the `author`/`username`/`owner` arg accepted by several tools: username, numeric uid, or `"me"` (needs `DRUPALORG_USERNAME` env var set).
- `listOwnerProjects(uid)` — shared helper behind `list_my_projects` and `find_maintained_projects`; fans out one request per entry in `PROJECT_TYPES` and merges — the api-d7 `type` filter does NOT accept comma-separated OR lists (verified: returns 0 results), so don't try to collapse that into a single call.
- `PROJECT_TYPES` includes `project_general` (recipes and other non-code projects) alongside `project_module`/`project_theme`/`project_distribution`/`project_core` — added after a real recipe project was missing from results.
- `find_maintained_projects` is a scoped reverse maintainer lookup: drupal.org has no global user→projects endpoint, so it scans `maintainers.json` for every project authored by a given `owner`. Not usable unscoped across all of drupal.org.
- Tools registered in `TOOLS` array + dispatched in the `CallToolRequestSchema` handler — keep both in sync when adding a tool.

## Conventions
- Every tool handler returns `{ content: [{ type: "text", text: ... }] }`; errors return the same shape with `isError: true` and `Error: ` prefix — don't throw raw errors across the MCP boundary.
- Status/priority/category are drupal.org's internal numeric taxonomy IDs. Don't hardcode new magic numbers without adding them to the `ISSUE_*` maps at the top.
- `UA` constant points at the GitHub repo (`+https://github.com/zaporylie/drupalorg-mcp`) — drupal.org asks API consumers to identify themselves. Update if forked/republished elsewhere.
- `index.js` must stay executable (`chmod +x`) — required for the npm `bin` entry to work via `npx`/global install.

## Running
```
node index.js
```
Requires Node 18+ (uses global `fetch`). No auth needed — api-d7 is public. Optional `DRUPALORG_USERNAME` env var enables `"me"` as an author/username/owner value in tool calls.

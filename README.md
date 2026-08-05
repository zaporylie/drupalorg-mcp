# drupalorg-mcp

MCP server for drupal.org's public [api-d7 REST API](https://www.drupal.org/drupalorg/docs/apis/rest-and-other-apis). Read-only, no authentication required.

## Quick start (Claude Code)

```bash
claude mcp add drupalorg -s user -e DRUPALORG_USERNAME=your-username -- npx -y drupalorg-mcp
```

`-e DRUPALORG_USERNAME=...` is optional — set it to enable `author: "me"` in tool calls instead of passing your username every time. Verify with `claude mcp list`.

## Tools

- **resolve_project** — resolve a project machine name (e.g. `commerce`) to its numeric project ID.
- **resolve_user** — resolve a drupal.org username to its numeric uid.
- **list_issues** — list issues, optionally filtered by project, status, priority, category, and/or author. Omit the project to search across all of drupal.org (e.g. "issues I created"). Paginated (50/page).
- **get_issue** — full details for a single issue by node ID, including related merge requests and credit metadata.
- **get_issue_comments** — all comments for an issue by node ID.
- **list_my_projects** — list projects (modules/themes/distributions/core/recipes) owned by a given user. Useful before listing "open issues on my project".
- **get_project_maintainers** — list a project's maintainers and their permissions, by machine name.
- **find_maintained_projects** — reverse maintainer lookup, scoped to one owner: given a user and an owner (e.g. `centarro`), returns which of the owner's projects that user maintains. drupal.org has no global user→projects maintainer endpoint, so this scans `maintainers.json` for every project authored by `owner` — not usable unscoped across all of drupal.org.

Tools that take an `author`/`username`/`owner` argument accept a username, a numeric uid, or the literal `"me"` (requires `DRUPALORG_USERNAME` env var, see below).

## Requirements

- Node.js 18+ (uses global `fetch`)

## Usage

Runs via `npx` — no install/clone needed, always fetches the latest published version.

### Add to other MCP clients

E.g. Claude Desktop's config:

```json
{
  "mcpServers": {
    "drupalorg": {
      "command": "npx",
      "args": ["-y", "drupalorg-mcp"],
      "env": { "DRUPALORG_USERNAME": "your-username" }
    }
  }
}
```

`DRUPALORG_USERNAME` is optional — set it to enable `author: "me"` in tool calls instead of passing your username every time.

### Running from a local checkout

For development, or if you'd rather not fetch from npm on every launch:

```bash
npm install
node index.js
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow.

### Hosting a remote instance (e.g. for claude.ai custom connectors)

The stdio server above only works with local MCP clients. To add this as a **claude.ai custom connector**, host it as a remote HTTP server instead — see [DEPLOYMENT.md](DEPLOYMENT.md) for the Docker + reverse-proxy setup.

A hosted instance is available at `https://drupalorg.piasecki.dev/mcp` — add it as a custom connector in claude.ai or any remote MCP client. Best-effort, no SLA.

## Notes

- The `UA` header in `server-core.js` identifies this tool to drupal.org's API — update it if you fork/republish under a different repo.
- All status/priority/category values are translated from drupal.org's internal numeric IDs to readable labels.

## Related: drupalcode-mcp

- This server (drupalorg-mcp) covers drupal.org itself — issue queues, projects, maintainers — via the public api-d7 REST API; read-only, no authentication.
- Its sibling, [drupalcode-mcp](https://github.com/zaporylie/drupalcode-mcp), covers git.drupalcode.org (Drupal's GitLab): code, merge requests, CI. It is authenticated — OAuth against git.drupalcode.org, each user acts as themselves.
- A hosted instance of drupalcode-mcp is available at `https://drupalcode.piasecki.dev/mcp` — add it as a custom connector in claude.ai or any remote MCP client. Best-effort, no SLA.
- The two complement each other: issue metadata and credits live on drupal.org, code and MRs live on git.drupalcode.org — use both for full coverage of a drupal.org project.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code structure, and publishing steps.

---

Built with [Claude Code](https://claude.com/claude-code) — code, docs, CI workflow, and npm packaging were written by Claude in collaboration with the repo owner.

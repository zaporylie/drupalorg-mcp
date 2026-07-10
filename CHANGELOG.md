# Changelog

All notable changes to this project are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.0] - 2026-07-10

### Added
- `get_issue_credits` tool: checks contribution credit for an issue via drupal.org's
  JSON:API (`node--contribution_record` / `paragraph--contributor`), which api-d7 has
  no equivalent for. Reports who was credited, volunteer vs sponsored, and org
  attribution — or that credit was never saved.

## [0.1.1] - 2026-07-09

### Fixed
- `bin` path in `package.json` so `npx`/global install resolves `index.js` correctly.

## [0.1.0] - 2026-07-09

Initial release: read-only MCP server wrapping drupal.org's api-d7 REST API.

### Added
- `resolve_project`, `resolve_user` — machine name / username to numeric ID.
- `list_issues`, `get_issue`, `get_issue_comments` — issue queue access.
- `list_my_projects`, `get_project_maintainers`, `find_maintained_projects` —
  project/maintainer lookups, including reverse (user → maintained projects) via
  scanned `maintainers.json`.
- `DRUPALORG_USERNAME` env var enabling `"me"` as an author/username/owner value.

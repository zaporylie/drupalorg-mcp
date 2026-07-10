#!/usr/bin/env node
// drupal.org read-only MCP server (api-d7 REST)
// Requires Node 18+ (global fetch). No auth needed — this API is public/read-only.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BASE = "https://www.drupal.org/api-d7";
const UA = "drupalorg-mcp/0.1 (+https://github.com/zaporylie/drupalorg-mcp)";

// Optional: set DRUPALORG_USERNAME to enable author: "me" in tools without
// having to pass a username/uid every call.
const DEFAULT_USERNAME = process.env.DRUPALORG_USERNAME || null;

// project node type -> label, for list_my_projects
const PROJECT_TYPES = [
  "project_module",
  "project_theme",
  "project_distribution",
  "project_core",
  "project_general", // recipes and other non-code projects
];

const ISSUE_STATUS = {
  1: "active", 2: "fixed", 3: "closed (duplicate)", 4: "postponed",
  5: "closed (won't fix)", 6: "closed (works as designed)", 7: "closed (fixed)",
  8: "needs review", 13: "needs work", 14: "reviewed & tested by the community",
  15: "patch (to be ported)", 16: "postponed (maintainer needs more info)",
  17: "closed (outdated)", 18: "closed (cannot reproduce)",
};
const ISSUE_PRIORITY = { 400: "Critical", 300: "Major", 200: "Normal", 100: "Minor" };
const ISSUE_CATEGORY = { 1: "Bug report", 2: "Task", 3: "Feature request", 4: "Support request", 5: "Plan" };

// name -> status code, for convenience when calling tools
const STATUS_NAME_TO_CODE = Object.fromEntries(
  Object.entries(ISSUE_STATUS).map(([code, name]) => [name, Number(code)])
);

async function d(path, params = {}) {
  const url = new URL(`${BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }
  if (!url.pathname.endsWith(".json")) url.pathname += ".json";
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`drupal.org API ${res.status}: ${url}`);
  return res.json();
}

// Maintainers live outside api-d7, at /project/<machine_name>/maintainers.json.
// Response shape: { "<uid>": { name, permissions }, ... } — no reverse (user -> projects) endpoint exists.
async function getProjectMaintainers(machineName) {
  const url = `https://www.drupal.org/project/${machineName}/maintainers.json`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`drupal.org API ${res.status}: ${url}`);
  return res.json();
}

async function listOwnerProjects(uid) {
  const results = await Promise.all(
    PROJECT_TYPES.map((type) =>
      d("node", { type, author: uid, page: 0 }).catch(() => ({ list: [] }))
    )
  );
  return results.flatMap((data) => data.list ?? []).map((node) => ({
    nid: node.nid,
    title: node.title,
    machine_name: node.field_project_machine_name,
    type: node.type,
  }));
}

function decorateIssue(node) {
  const status = node.field_issue_status?.value ?? node.field_issue_status;
  const priority = node.field_issue_priority?.value ?? node.field_issue_priority;
  const category = node.field_issue_category?.value ?? node.field_issue_category;
  return {
    nid: node.nid,
    title: node.title,
    status: ISSUE_STATUS[status] ?? status,
    priority: ISSUE_PRIORITY[priority] ?? priority,
    category: ISSUE_CATEGORY[category] ?? category,
    url: `https://www.drupal.org/node/${node.nid}`,
    created: node.created,
    changed: node.changed,
    author: node.author?.id ?? node.uid,
  };
}

// Simple in-memory cache: project machine_name -> nid
const projectNidCache = new Map();

async function resolveProjectNid(machineName) {
  if (projectNidCache.has(machineName)) return projectNidCache.get(machineName);
  const data = await d("node", { field_project_machine_name: machineName });
  const list = data.list ?? [];
  if (!list.length) throw new Error(`No project found for machine name "${machineName}"`);
  const nid = list[0].field_project?.id ?? list[0].nid;
  projectNidCache.set(machineName, nid);
  return nid;
}

// Simple in-memory cache: username -> uid
const userUidCache = new Map();

async function resolveUserUid(username) {
  if (userUidCache.has(username)) return userUidCache.get(username);
  const data = await d("user", { name: username });
  const list = data.list ?? [];
  if (!list.length) throw new Error(`No drupal.org user found for username "${username}"`);
  const uid = list[0].uid;
  userUidCache.set(username, uid);
  return uid;
}

// Resolves the "author" arg accepted by several tools: a username string,
// a numeric uid, or the literal "me" (requires DRUPALORG_USERNAME env var).
async function resolveAuthorArg(author) {
  if (author === "me") {
    if (!DEFAULT_USERNAME) {
      throw new Error('author: "me" requires the DRUPALORG_USERNAME environment variable to be set');
    }
    return resolveUserUid(DEFAULT_USERNAME);
  }
  if (/^\d+$/.test(String(author))) return Number(author);
  return resolveUserUid(author);
}

const server = new Server(
  { name: "drupalorg-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

const TOOLS = [
  {
    name: "resolve_project",
    description: "Resolve a drupal.org project machine name (e.g. 'commerce', 'drupal') to its numeric project ID, needed for filtering issues.",
    inputSchema: {
      type: "object",
      properties: { machine_name: { type: "string" } },
      required: ["machine_name"],
    },
  },
  {
    name: "list_issues",
    description: "List project_issue nodes, optionally filtered by project, status, priority, category, and/or author. Omit project_machine_name to search across all of drupal.org (e.g. combine with author to find issues you created anywhere). Returns up to 50 per page.",
    inputSchema: {
      type: "object",
      properties: {
        project_machine_name: { type: "string", description: "e.g. 'commerce'. Omit to search across all projects." },
        status: { type: "string", description: "e.g. 'active', 'needs review', 'needs work'" },
        priority: { type: "string", enum: ["Critical", "Major", "Normal", "Minor"] },
        category: { type: "string", enum: ["Bug report", "Task", "Feature request", "Support request", "Plan"] },
        author: { type: "string", description: "drupal.org username, numeric uid, or 'me' (requires DRUPALORG_USERNAME env var). Filters to issues created by this user." },
        page: { type: "number", default: 0 },
      },
    },
  },
  {
    name: "resolve_user",
    description: "Resolve a drupal.org username to their numeric uid and basic profile info.",
    inputSchema: {
      type: "object",
      properties: { username: { type: "string" } },
      required: ["username"],
    },
  },
  {
    name: "list_my_projects",
    description: "List projects (modules, themes, distributions, core) authored/owned by a given drupal.org user. Useful to find 'my projects' before listing their issues.",
    inputSchema: {
      type: "object",
      properties: {
        author: { type: "string", description: "drupal.org username, numeric uid, or 'me' (requires DRUPALORG_USERNAME env var)." },
        page: { type: "number", default: 0 },
      },
      required: ["author"],
    },
  },
  {
    name: "get_project_maintainers",
    description: "List the maintainers of a drupal.org project (with their permissions), by project machine name.",
    inputSchema: {
      type: "object",
      properties: { project_machine_name: { type: "string", description: "e.g. 'commerce'" } },
      required: ["project_machine_name"],
    },
  },
  {
    name: "find_maintained_projects",
    description: "Reverse maintainer lookup, scoped to one owner: given a username and an owner (org or user) whose projects to scan, returns which of the owner's projects the given user maintains. drupal.org has no direct user->projects maintainer endpoint, so this checks maintainers.json for every project authored by `owner`; not usable for a global/unscoped search.",
    inputSchema: {
      type: "object",
      properties: {
        username: { type: "string", description: "drupal.org username, numeric uid, or 'me' (requires DRUPALORG_USERNAME env var). The user to check maintainer status for." },
        owner: { type: "string", description: "drupal.org username, numeric uid, or 'me'. Whose projects to scan (e.g. 'centarro')." },
      },
      required: ["username", "owner"],
    },
  },
  {
    name: "get_issue",
    description: "Get full details for a single issue by node ID, including related merge requests and credit metadata.",
    inputSchema: {
      type: "object",
      properties: { nid: { type: "number" } },
      required: ["nid"],
    },
  },
  {
    name: "get_issue_comments",
    description: "Get all comments for an issue by node ID.",
    inputSchema: {
      type: "object",
      properties: { nid: { type: "number" } },
      required: ["nid"],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    if (name === "resolve_project") {
      const nid = await resolveProjectNid(args.machine_name);
      return { content: [{ type: "text", text: JSON.stringify({ machine_name: args.machine_name, nid }) }] };
    }

    if (name === "list_issues") {
      const params = { type: "project_issue", page: args.page ?? 0 };
      if (args.project_machine_name) {
        params.field_project = await resolveProjectNid(args.project_machine_name);
      }
      if (args.status) params.field_issue_status = STATUS_NAME_TO_CODE[args.status] ?? args.status;
      if (args.priority) {
        const rev = Object.fromEntries(Object.entries(ISSUE_PRIORITY).map(([k, v]) => [v, k]));
        params.field_issue_priority = rev[args.priority];
      }
      if (args.category) {
        const rev = Object.fromEntries(Object.entries(ISSUE_CATEGORY).map(([k, v]) => [v, k]));
        params.field_issue_category = rev[args.category];
      }
      if (args.author) params.author = await resolveAuthorArg(args.author);
      const data = await d("node", params);
      const issues = (data.list ?? []).map(decorateIssue);
      return { content: [{ type: "text", text: JSON.stringify(issues, null, 2) }] };
    }

    if (name === "resolve_user") {
      const uid = await resolveUserUid(args.username);
      return { content: [{ type: "text", text: JSON.stringify({ username: args.username, uid }) }] };
    }

    if (name === "list_my_projects") {
      const uid = await resolveAuthorArg(args.author);
      const projects = (await listOwnerProjects(uid)).map((p) => ({
        ...p,
        url: `https://www.drupal.org/project/${p.machine_name ?? p.nid}`,
      }));
      return { content: [{ type: "text", text: JSON.stringify(projects, null, 2) }] };
    }

    if (name === "get_project_maintainers") {
      const maintainers = await getProjectMaintainers(args.project_machine_name);
      const list = Object.entries(maintainers).map(([uid, info]) => ({
        uid: Number(uid),
        name: info.name,
        permissions: Object.keys(info.permissions ?? {}),
      }));
      return { content: [{ type: "text", text: JSON.stringify(list, null, 2) }] };
    }

    if (name === "find_maintained_projects") {
      const targetUid = await resolveAuthorArg(args.username);
      const ownerUid = await resolveAuthorArg(args.owner);
      const ownerProjects = (await listOwnerProjects(ownerUid)).filter((p) => p.machine_name);
      const checks = await Promise.all(
        ownerProjects.map(async (p) => {
          try {
            const maintainers = await getProjectMaintainers(p.machine_name);
            return maintainers[String(targetUid)] ? p : null;
          } catch {
            return null;
          }
        })
      );
      const maintained = checks
        .filter(Boolean)
        .map((p) => ({ ...p, url: `https://www.drupal.org/project/${p.machine_name}` }));
      return { content: [{ type: "text", text: JSON.stringify(maintained, null, 2) }] };
    }

    if (name === "get_issue") {
      const node = await d(`node/${args.nid}`, { related_mrs: 1, drupalorg_extra_credit: 1 });
      return { content: [{ type: "text", text: JSON.stringify(decorateIssue(node), null, 2) }] };
    }

    if (name === "get_issue_comments") {
      const data = await d("comment", { node: args.nid });
      const comments = (data.list ?? []).map((c) => ({
        cid: c.cid,
        subject: c.subject,
        author: c.author?.id ?? c.uid,
        created: c.created,
        body: c.comment_body?.value ?? c.comment_body,
      }));
      return { content: [{ type: "text", text: JSON.stringify(comments, null, 2) }] };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);

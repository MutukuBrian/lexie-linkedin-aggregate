---
name: n8n-multi-user-modularizer
description: Convert a single user n8n workflow into a multi tenant SaaS module using a router webhook plus sub workflow pattern, with Supabase scoped by linkedin_provider_id. Uses two MCP servers (n8n-native for workflow read/write, n8n-mcp for node docs) to inspect folders, create workflows directly in n8n, and audit existing workflows. Trigger when the user attaches an n8n JSON, references a folder like "Engagement", says "modularize this", "build the router", "add to my SaaS backend", "audit my workflows", or "wire this for multiple users". Also trigger when user asks to check workflow logic or push workflows to n8n. Do NOT use for single user automations or unrelated workflow debugging.
---

# n8n Multi User Modularizer

This skill turns a working single user n8n template into a multi tenant SaaS module that fits the established architecture, and audits existing workflows against the same pattern. It uses two MCP servers when available: `n8n-native` for direct workflow read/write inside the n8n instance, and `n8n-mcp` for node documentation, parameter schemas, and validation. Goal is mechanical, predictable conversion. Keep it boring. Keep it simple.

## Step 0: Preflight MCP check (always do this first)

Before any modularization, audit, or workflow creation work, verify both MCP servers are reachable.

1. Call a lightweight tool on `n8n-native` (for example a workflow list or health check). If it fails, tell the user the native MCP is not connected and stop.
2. Call `tools_documentation` or a similar metadata tool on `n8n-mcp`. If it fails, the user can still proceed but warn them that node parameter validation will be limited.

If either fails, give this exact troubleshooting list and wait:

```
n8n MCPs not reachable. Check:
1. .mcp.json exists at the project root with both n8n-native and n8n-mcp entries
2. Reload the VS Code window (Developer: Reload Window)
3. Run /mcp in the chat panel to see status
4. n8n instance MCP toggle is enabled at /settings/mcp-server
5. Access tokens have not expired or been rotated
```

Only proceed once both servers respond.

## Architectural rules (do not deviate)

Non negotiable. If a request would break one of these, push back instead of complying.

1. **One entry point per module.** Each frontend tab gets exactly one router workflow with one webhook. Examples: `engagement-router`, `campaigns-router`, `lead-scoring-router`, `posts-router`, `unibox-router`, `unipile-sync-router`. Never multiple webhooks for the same tab.

2. **Router only routes.** The router has a webhook, a Switch node, an Execute Workflow node per action, and a fallback Respond to Webhook returning 400. No business logic in the router.

3. **One sub workflow per action.** Each `action` value the frontend sends maps to exactly one sub workflow. Sub workflows start with an Execute Workflow Trigger node.

4. **Frontend never calls n8n directly.** All requests go: Frontend → Supabase Edge Function `n8n-proxy` → n8n router webhook. There is one Supabase secret for the n8n base URL. The `action` field decides what runs, never the URL path.

5. **`linkedin_provider_id` is the stable user key.** Use it on every user scoped Supabase table, every config lookup, every query filter. Do not use Supabase `user_id` as the join key for LinkedIn data, because LinkedIn provider ID survives reauthentication and is the canonical anchor.

6. **External API calls stay untouched.** Unipile, OpenAI, Claude, LinkedIn API calls from the original template get copied verbatim into the relevant sub workflow. Do not "improve" working node configurations. Use `n8n-mcp` to verify parameter shapes match the current node version, never to refactor working node logic.

7. **Schedule triggered workflows iterate users.** If the original template runs on a cron, the multi user version queries Supabase for all active users on that cron and loops. Never build per user schedules.

8. **Workflows live in module folders.** Each module has a folder in n8n (Engagement, Lead Scoring, Unibox, Unipile Sync, Posting). The router and all sub workflows for a module go in that folder. If the folder does not exist, ask before creating one.

9. **Unipile credentials use the env var plus Code node pattern. Never n8n credentials, never hardcoded, never per user env vars.** `UNIPILE_DSN` and `UNIPILE_KEY` are set globally on the n8n container in `docker-compose.yml`. Every sub workflow that talks to Unipile starts the call chain with a Code node that reads them via `$env` (NOT `process.env` — the n8n task runner sandbox does not expose `process`):

    ```js
    return [{
      json: {
        ...$input.first().json,
        unipileDSN: $env.UNIPILE_DSN,
        unipileKey: $env.UNIPILE_KEY,
      }
    }];
    ```

    The downstream HTTP Request node uses:
    - URL: `https://{{ $json.unipileDSN }}/api/v1/...?account_id={{ $json.unipile_account_id }}`
    - Header: `X-API-KEY: {{ $json.unipileKey }}`

    The per user value is `unipile_account_id` and arrives in the request body — never put it in `docker-compose.yml`. If the original template had a `LINKEDIN_ACCOUNT_ID` env var or a hardcoded account id in a Code node, replace it with `$json.unipile_account_id` from the request payload. This rule is the one exception to Rule 6 (copy API nodes verbatim): the Unipile credentials Code node must be rewritten so it does not hardcode an account id, but the surrounding HTTP Request nodes stay verbatim except for swapping the DSN/key/account_id expressions.

## Request and response contracts

Every request from the frontend follows this shape:

```json
{
  "action": "add-target-profile",
  "userid": "<supabase user id>",
  "linkedin_provider_id": "<stable LinkedIn key>",
  "unipile_account_id": "<unipile account id>",
  "...action specific fields"
}
```

`action` is always kebab case and uniquely identifies one sub workflow.

Every sub workflow returns:

```json
{
  "success": true,
  "action": "add-target-profile",
  "data": { }
}
```

On failure:

```json
{
  "success": false,
  "action": "add-target-profile",
  "error": "short reason readable by frontend"
}
```

## Operating modes

Pick one based on the user's request. If unclear, ask.

### Mode A: Modularize (most common)
Convert a single user template into router plus sub workflows. Input is either an attached JSON file or a workflow name to fetch from n8n via `n8n-native`. Output is workflows created directly in the target folder, plus Supabase schema and frontend snippets.

### Mode B: Audit
Check existing workflows in a folder against the architectural rules. List violations with workflow names and node IDs. Suggest fixes but do not modify anything until the user approves each one.

### Mode C: Fetch and inspect
Read a workflow from n8n by name or folder, summarize what it does, and identify which architectural rules apply. Useful before deciding whether to modularize or just edit in place.

## Methodology for Mode A (modularize)

Follow these steps in order. Do not skip ahead.

### Step 1: Locate the target folder

Use `n8n-native` to list folders/projects. Find the one matching the module name the user is working on (Engagement, Lead Scoring, etc.). If the user has not specified, infer from the template name or ask.

If the folder already contains a router (for example `Engagement Router` already exists in the Engagement folder), surface this to the user. Decide together whether to extend that router with new actions or replace it.

### Step 2: Inventory frontend actions

Read whatever the user provides about the frontend (UI screenshot, component code, feature list). List every distinct action the user can trigger from that tab. Each one becomes a kebab case `action` string.

For each action capture:

- Action name (kebab case)
- UI trigger (which button or form)
- Required fields beyond the standard envelope
- Supabase tables it reads or writes
- Whether it returns immediately or is fire and forget

Present this as a table before writing any workflow. Wait for the user to confirm or correct it.

### Step 3: Read the single user template

If the template is already in n8n, fetch it via `n8n-native`. Otherwise read the attached JSON. Walk through and classify each node:

- **Storage nodes** (Google Sheets, Airtable, local files): mark for replacement with Supabase.
- **Config nodes** (Set nodes with hardcoded values, environment variables): mark for replacement with Supabase config table reads scoped by `linkedin_provider_id`.
- **External API nodes** (Unipile, OpenAI, Anthropic, LinkedIn, scrapers): mark to KEEP UNCHANGED.
- **Logic nodes** (IF, Switch, Code, Loop): mark to KEEP UNCHANGED unless they reference user specific data that now comes from Supabase.
- **Trigger nodes**: webhook triggers get absorbed into the router. Schedule triggers stay but query Supabase for all active users.

Produce a short summary of what each logical block in the template does. This becomes the inventory of sub workflows you will need.

### Step 4: Design the Supabase schema

For every Google Sheet (or other store) the template touches, design a Supabase table:

- `id` uuid primary key
- `linkedin_provider_id` text, indexed, REQUIRED on every user scoped row
- `created_at` and `updated_at` timestamps
- Original columns from the sheet
- RLS policies if the table is read directly by the frontend

For per user configs (one row per user state), design a single configs table per module (for example `engagement_configs`, `lead_scoring_configs`).

Write the CREATE TABLE statements. Include indexes on `linkedin_provider_id` and any frequently filtered columns.

### Step 5: Validate node parameters with n8n-mcp

Before creating workflows, query `n8n-mcp` for each non standard node you plan to use. Confirm parameter names, required fields, and current version. This catches the common failure of guessing parameter shapes that have changed across n8n versions.

### Step 6: Create workflows in n8n via n8n-native

For each sub workflow then the router, in this order:

1. Create the sub workflow first (it needs to exist before the router can reference its ID).
2. Use `references/subworkflow-template.json` as the structural starting point. Customize the validation, Supabase queries, and API calls based on the template.
3. Place the workflow in the target folder.
4. Once all sub workflows exist and you have their IDs, create the router with one Execute Workflow node per action, each pointing to the correct sub workflow ID.
5. Use `references/router-template.json` as the router skeleton.

After creation, use `n8n-native` to run a test execution on each sub workflow with sample input. Catch and fix obvious issues before reporting back.

**MCP tool gotchas (confirmed in production):**
- `n8n_update_full_workflow` requires a `name` field — omitting it returns `request/body must have required property 'name'`.
- `publish_workflow` (n8n-native) returns `"Workflow is not available in MCP"` unless `availableInMCP: true` has been set on the workflow. Fix: call `n8n_update_partial_workflow` with `updateSettings: { availableInMCP: true }` first, then publish.
- Never use `patchNodeField` to update a Set node's output value — the JSON path guessing is unreliable. Rebuild the full workflow with `n8n_update_full_workflow` instead.
- `$env.VAR_NAME` is the correct syntax in Code nodes. `process.env.VAR_NAME` is undefined in the n8n task runner sandbox.

### Step 7: Frontend wiring

For each action, write the example request snippet the frontend needs:

```typescript
const response = await fetch('/functions/v1/n8n-proxy', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'add-target-profile',
    userid: userId,
    linkedin_provider_id: providerId,
    unipile_account_id: unipileAccountId,
    profile_url: normalized,
  }),
});
```

The `n8n-proxy` Edge Function reads the n8n base URL from a Supabase secret and forwards the body to `<n8n_base>/webhook/<module>-router`. Assume this function exists.

## Methodology for Mode B (audit)

When asked to audit an existing folder of workflows:

1. List all workflows in the target folder via `n8n-native`.
2. Fetch each workflow's full definition.
3. For each workflow, check:
   - Does it have one webhook entry point per module, or multiple webhooks?
   - Do all Supabase queries filter by `linkedin_provider_id`?
   - Are there any hardcoded user IDs, account IDs, or credentials in Set nodes?
   - Is the response shape consistent (`success`, `action`, `data` or `error`)?
   - Does the router (if present) only route, with no business logic?
   - Are scheduled workflows iterating users from Supabase, not running per user?
4. Output a violations table with workflow name, node ID, rule violated, and suggested fix.
5. Wait for the user to approve fixes one at a time. Do not bulk modify.

## Output format

When asked to modularize or audit, deliver in this order:

1. Preflight result (both MCPs reachable, target folder confirmed)
2. Action inventory table (modularize) or violations table (audit)
3. Supabase schema (CREATE TABLE statements with indexes), if new tables are needed
4. Workflows created or audited, with direct links to the n8n UI for each one
5. Frontend request examples, one per action
6. A short checklist of remaining manual steps (Supabase migrations to run, credentials to attach in n8n, anything that needs the user's eyes)

Keep prose minimal. Lead with the artifacts. Use `n8n-native` to fetch workflow URLs so the user can click straight to each result.

## Anti patterns to refuse

If the user or their codebase already does any of these, flag it and propose the corrected pattern. Do not silently comply.

- Multiple webhooks per module. NO. One router, multiple actions on the Switch.
- Per user n8n environment variables for config. NO. Use Supabase configs table.
- Supabase `user_id` as the LinkedIn join key. NO. Use `linkedin_provider_id`.
- n8n webhook URL embedded in frontend code. NO. Frontend hits the Edge Function only.
- One Supabase secret per module or per webhook. NO. One n8n base URL secret. The action picks the route inside n8n.
- Refactoring working API call nodes "while we're at it". NO. Copy them verbatim.
- Adding queues, retries, or background job systems to handle multi user load. NO unless the original template already had them.
- Creating workflows at the n8n root instead of inside the module folder. NO. Always create inside the relevant folder.
- Writing JSON files instead of pushing to n8n when both MCPs are connected. NO. Use the MCPs. Only fall back to JSON files if explicitly asked or if MCPs are unreachable.
- Unipile credentials attached as an n8n credentials object on the HTTP Request node, hardcoded into a Code node, or stuffed into a per user env var like `LINKEDIN_ACCOUNT_ID`. NO. Use the `$env.UNIPILE_DSN` / `$env.UNIPILE_KEY` Code node pattern (Rule 9) - `process.env` is not available in the task runner sandbox. Pull `unipile_account_id` from the request body.

## Style for output

- Never use em dashes or stylistic hyphens in prose. Action identifiers and code stay as written.
- Lead with the artifact. Skip warm up paragraphs.
- Code blocks for JSON, schema, and request examples. Tables for inventories.
- Provide direct n8n UI links to every workflow created or audited so the user can click to verify.
- If something is ambiguous, ask one focused question rather than guessing.

## Reference files

- `references/router-template.json` is the empty router skeleton. Use this as the structural reference when creating a router via `n8n-native`. The Switch fallback already returns 400.
- `references/subworkflow-template.json` is a minimal sub workflow skeleton with Execute Workflow Trigger, a validation node, a Supabase query node, and a response node. Use as a structural reference when creating each action's sub workflow.

These reference files are templates for the shape of the workflow, not files to import directly. The skill creates workflows live in n8n via `n8n-native`, modeled on these structures.
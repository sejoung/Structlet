---
name: structlet
description: Create or update editable Structlet architecture diagrams from requirements, repositories, or infrastructure definitions and produce a validated .structlet file.
---

# Build a Structlet diagram

Deliver a validated, editable `.structlet` file. Keep the intermediate JSON in a temporary directory unless the user asks for it as a separate deliverable.

1. Read the draft contract in the [English prompt](references/prompt-en.md) or [Korean prompt](references/prompt-ko.md). Use the user's language for diagram labels. Select built-in service IDs from [the service catalog](references/services.tsv). Structlet applies any official icon assets users load in their browser to those IDs.
2. Use the supplied requirements and authorized project files. Identify grouping boundaries and actual service connections before writing the draft. Include equipment specs where confirmed. Keep cloud credentials, tokens, and secret values out of the diagram.
3. For a new diagram, omit coordinates so Structlet can lay it out. For a revision, read the existing `.structlet` file, use its exact object IDs, and include only the requested changes. Include `remove` only for explicitly requested deletions.
4. Write a strict JSON draft. Resolve `scripts/compile.mjs` relative to this `SKILL.md` and run it with Node.js 22 or later. Use a new filename for a revision.

```sh
node /path/to/structlet/scripts/compile.mjs architecture.draft.json architecture.structlet
node /path/to/structlet/scripts/compile.mjs update.draft.json revised.structlet --base existing.structlet
```

The compiler validates through Structlet's importer, lays out new objects, and saves the file. Correct validation errors and retry. Lead with the resulting `.structlet` path once validation succeeds.

For Terraform diagrams, label the source as declared configuration and state which environment it covers. Describe observed deployment state only when supported by separate evidence. Label traffic, management actions, and configuration dependencies by their meaning. Attach security group ports, IAM roles, and remote-state references as notes when they explain a connection. When a referenced script or configuration file is unavailable, show the declared association and mark the implementation as unverified.

When compilation is blocked, report the specific problem. The draft can be converted in **User guide → Build a diagram with AI** for a new diagram, or applied through **File → Import** with the existing diagram open for a revision. Share the draft when the user asks for it.

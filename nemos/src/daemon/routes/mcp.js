// ============================================================
// MCP server — Model Context Protocol endpoint at POST /mcp
// Spec: modelcontextprotocol.io, revisions 2025-06-18 + 2025-11-25.
// Transport: Streamable HTTP, STATELESS mode (no Mcp-Session-Id —
// the daemon is a local single-tenant service; sessions add state
// without value here). JSON-RPC 2.0, single-message only (batching
// was removed from the spec).
//
// Zero dependencies: the implemented surface (initialize / ping /
// tools/list / tools/call) is a deliberate spec subset, hand-rolled
// to keep the daemon dependency-light. Tools are wired to the SAME
// core-loop implementation as the HTTP routes (src/daemon/core-loop.js),
// so MCP can never drift from the HTTP API.
//
// Auth + rate limiting apply (this router sits behind the shared
// middleware — /mcp is NOT exempt).
// ============================================================

const VERSION = require("../../../package.json").version;

const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18"];
const LATEST_VERSION = SUPPORTED_VERSIONS[0];

// JSON-RPC error codes
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

function rpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}
function rpcError(id, code, message, data) {
  const err = { code, message };
  if (data !== undefined) err.data = data;
  return { jsonrpc: "2.0", id, error: err };
}

// ---- Tool schemas (JSON Schema, draft 2020 style subset) ----

const TOOLS = [
  {
    name: "nemons.analyze_prompt",
    title: "Analyze prompt",
    description:
      "Decide whether Nemons should intercept a coding prompt, and build the dynamic context pack (persona + skills + experiences + harness + subagents) when it does.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "The coding prompt to analyze" },
        adapter: { type: "string", description: "Coding-agent adapter identifier", default: "mcp" },
      },
      required: ["prompt"],
    },
  },
  {
    name: "nemons.get_context_pack",
    title: "Get context pack",
    description: "Return a stored context pack by id (falls back to the default pack when not found).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$" },
      },
      required: ["id"],
    },
  },
  {
    name: "nemons.collect_evidence",
    title: "Collect evidence",
    description: "Store run evidence (diffs, test results) under the run id; secrets are redacted on write.",
    inputSchema: {
      type: "object",
      properties: {
        run_id: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$" },
        evidence: { type: "object" },
      },
      required: ["run_id"],
    },
  },
  {
    name: "nemons.evaluate_run",
    title: "Evaluate run",
    description:
      "Run the 4-layer verification loop (grounding, self-consistency, LLM-judge prompt, deterministic constraints) over collected evidence. Returns pass/fail with layer detail and a failures list.",
    inputSchema: {
      type: "object",
      properties: {
        run_id: { type: "string" },
        evidence: { type: "object", description: "e.g. {tests_pass, no_syntax_errors, no_security_violations, no_secrets_in_diff}" },
        prompt: { type: "string" },
        adapter: { type: "string" },
      },
      required: ["run_id"],
    },
  },
  {
    name: "nemons.store_experience",
    title: "Store experience",
    description: "Persist a lesson/experience record for future reuse. Returns the generated experience id.",
    inputSchema: { type: "object", additionalProperties: true },
  },
  {
    name: "nemons.retrieve_similar_experiences",
    title: "Retrieve similar experiences",
    description: "Keyword-similarity retrieval over the CBR (case-based reasoning) experience store.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number", default: 3 },
      },
    },
  },
  {
    name: "nemons.health_check",
    title: "Health check",
    description: "Daemon health, version, and @nemons/core bridge status.",
    inputSchema: { type: "object", properties: {} },
  },
];

// Minimal JSON-Schema validation for the subset we declare:
// type, required, properties (string/number/object), pattern, additionalProperties.
function validateAgainstSchema(args, schema) {
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    return "arguments must be an object";
  }
  if (schema.properties) {
    for (const key of Object.keys(schema.properties)) {
      const prop = schema.properties[key];
      const val = args[key];
      if (val === undefined) continue;
      if (prop.type === "string" && typeof val !== "string") return `${key} must be a string`;
      if (prop.type === "number" && typeof val !== "number") return `${key} must be a number`;
      if (prop.type === "object" && (typeof val !== "object" || val === null || Array.isArray(val))) {
        return `${key} must be an object`;
      }
      if (prop.pattern && typeof val === "string" && !new RegExp(prop.pattern).test(val)) {
        return `${key} must match ${prop.pattern}`;
      }
    }
  }
  if (Array.isArray(schema.required)) {
    for (const key of schema.required) {
      if (args[key] === undefined) return `missing required argument: ${key}`;
    }
  }
  return null;
}

module.exports = function register(app, ctx) {
  const { coreLoop, services, counters, NEMONS_HOME, redactSecrets, verifier } = ctx;

  // ---- Tool implementations (same core loop as HTTP) ----
  async function callTool(name, args) {
    switch (name) {
      case "nemons.analyze_prompt":
        return coreLoop.analyzePrompt(args, { pipeline: services.pipeline, counters });
      case "nemons.get_context_pack": {
        const { status, body } = await coreLoop.getContextPack(args.id, { NEMONS_HOME });
        if (status !== 200) throw { expected: true, message: body.detail || body.error };
        return body;
      }
      case "nemons.collect_evidence": {
        const { status, body } = await coreLoop.collectEvidence(args, { NEMONS_HOME, counters, redactSecrets });
        if (status !== 200) throw { expected: true, message: body.detail || body.error };
        return body;
      }
      case "nemons.evaluate_run":
        return coreLoop.evaluateRun(args, { services, counters, verifier, pipeline: services.pipeline });
      case "nemons.store_experience":
        return coreLoop.storeExperience(args, { NEMONS_HOME });
      case "nemons.retrieve_similar_experiences":
        return { results: await services.cbr.retrieve(args.query || "", parseInt(args.limit || "3", 10)) };
      case "nemons.health_check":
        return {
          status: "healthy",
          version: require("../../../package.json").version,
          core_loaded: ctx.getCoreLoaded(),
          core_path: ctx.nemosBridge.corePath(),
        };
      default:
        return undefined; // unknown tool — caller turns this into -32602
    }
  }

  // ---- JSON-RPC dispatch ----
  async function handleMessage(msg) {
    const hasId = msg.id !== undefined && msg.id !== null;
    const id = hasId ? msg.id : null;

    if (msg.method === "initialize") {
      const requested = msg.params?.protocolVersion;
      // Echo the client's version when we support it, else our latest —
      // the client decides from OUR reply whether to proceed.
      const negotiated = SUPPORTED_VERSIONS.includes(requested) ? requested : LATEST_VERSION;
      return rpcResult(id, {
        protocolVersion: negotiated,
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: "nemons",
          title: "Nemons Agent Runtime",
          version: VERSION,
        },
        instructions:
          "Nemons is the governance runtime for coding agents: analyze prompts, build context packs, collect evidence, run the verification loop, and store/retrieve experiences.",
      });
    }

    if (msg.method === "ping") {
      return rpcResult(id, {});
    }

    if (msg.method === "tools/list") {
      return rpcResult(id, { tools: TOOLS });
    }

    if (msg.method === "tools/call") {
      const name = msg.params?.name;
      const args = msg.params?.arguments || {};
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) {
        return rpcError(id, INVALID_PARAMS, `Unknown tool: ${name}`);
      }
      const schemaError = validateAgainstSchema(args, tool.inputSchema);
      if (schemaError) {
        return rpcError(id, INVALID_PARAMS, schemaError);
      }
      try {
        const data = await callTool(name, args);
        if (data === undefined) {
          return rpcError(id, INVALID_PARAMS, `Unknown tool: ${name}`);
        }
        return rpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          structuredContent: data,
        });
      } catch (e) {
        // Expected failures (validation, not-found) are tool RESULTS with
        // isError — not protocol errors (spec-correct behavior).
        if (e && e.expected) {
          return rpcResult(id, {
            content: [{ type: "text", text: e.message }],
            isError: true,
          });
        }
        return rpcError(id, INTERNAL_ERROR, e && e.message ? e.message : "tool execution failed");
      }
    }

    // Notifications complete the handshake / lifecycle without replies
    if (!hasId && (msg.method === "notifications/initialized" || msg.method === "notifications/cancelled")) {
      return null; // 202 Accepted
    }

    if (hasId) {
      return rpcError(id, METHOD_NOT_FOUND, `Method not found: ${msg.method}`);
    }
    // Unknown notification — accepted and ignored
    return null;
  }

  // ---- HTTP surface (Streamable HTTP, stateless) ----
  app.post("/mcp", async (req, res) => {
    let msg;
    try {
      msg = req.body; // express.json already parsed
      if (typeof msg === "string") msg = JSON.parse(msg);
    } catch {
      return res.status(400).json(rpcError(null, PARSE_ERROR, "Invalid JSON"));
    }
    if (Array.isArray(msg)) {
      // JSON-RPC batching was removed from the MCP spec
      return res.status(400).json(rpcError(null, INVALID_REQUEST, "Batched requests are not supported"));
    }
    if (typeof msg !== "object" || msg === null || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
      return res.status(400).json(rpcError(null, INVALID_REQUEST, "Not a JSON-RPC 2.0 message"));
    }

    try {
      const reply = await handleMessage(msg);
      if (reply === null) {
        // notification — no body per the transport spec
        return res.status(202).end();
      }
      res.json(reply);
    } catch (e) {
      res.status(500).json(rpcError(msg.id ?? null, INTERNAL_ERROR, e.message));
    }
  });

  app.get("/mcp", (req, res) => {
    // Server-initiated SSE streams are not used in stateless mode
    res.status(405).json({ error: "method_not_allowed", detail: "POST JSON-RPC messages to /mcp" });
  });

  app.delete("/mcp", (req, res) => {
    // No sessions to terminate in stateless mode (spec allows 405)
    res.status(405).json({ error: "method_not_allowed", detail: "stateless server — nothing to terminate" });
  });
};

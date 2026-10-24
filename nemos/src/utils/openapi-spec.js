class OpenAPISpec {
  generate() {
    return {
      openapi: "3.0.3",
      info: { title: "Nemos API", version: "4.0.0" },
      paths: {
        "/health": { get: { summary: "Health check" } },
        "/analyze": { post: { summary: "Analyze prompt" } },
        "/verify": { post: { summary: "4-layer verification" } },
        "/evidence": { post: { summary: "Store evidence" } },
      },
    };
  }
  generateHTML() {
    return "<!DOCTYPE html><html><head><title>Nemos API</title></head><body><h1>Nemos API</h1><p>OpenAPI spec at /openapi</p></body></html>";
  }
}
module.exports = { OpenAPISpec };

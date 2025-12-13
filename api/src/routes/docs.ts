import { FastifyInstance } from "fastify";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";

function loadSpec() {
  const yamlPath = path.join(__dirname, "../../docs/openapi.yaml");
  const content = fs.readFileSync(yamlPath, "utf-8");
  return yaml.load(content);
}

export async function registerDocsRoutes(app: FastifyInstance) {
  app.get("/openapi.json", async (_request, reply) => {
    try {
      const spec = loadSpec();
      return reply.send(spec);
    } catch (err) {
      app.log.error({ err }, "failed to load openapi spec");
      return reply.code(500).send({ error: "internal_error", message: "Failed to load OpenAPI spec" });
    }
  });

  app.get("/docs", async (_request, reply) => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>FTM API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
  <script>
    window.onload = () => {
      SwaggerUIBundle({
        url: '/openapi.json',
        dom_id: '#swagger-ui',
        presets: [SwaggerUIBundle.presets.apis],
        layout: "BaseLayout"
      });
    };
  </script>
</body>
</html>`;
    reply.type("text/html").send(html);
  });
}

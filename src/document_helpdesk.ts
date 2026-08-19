import { createServer } from "node:http";
import { ZodError } from "zod";
import { answerTenantQuestion } from "./tenant_document_qa.js";

const collection = "saas-team-handbook";
const port = Number(process.env.PORT ?? 3000);

createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/questions") {
    response.writeHead(404).end();
    return;
  }
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const result = await answerTenantQuestion(body, collection);
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(result));
  } catch (error) {
    const status = error instanceof ZodError || error instanceof SyntaxError ? 400 : 500;
    const message = error instanceof Error ? error.message : "Unexpected request error";
    response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify({ error: message }));
  }
}).listen(port, () => console.log(`Document helpdesk listening on http://localhost:${port}`));

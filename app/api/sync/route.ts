import handleSync from "../../../lib/sync-core.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Preserve the tested provider service while exposing a Web Request/Response route.
async function handle(request: Request): Promise<Response> {
  let body: unknown;
  if (request.method === "POST") {
    const text = await request.text();
    if (text.length > 32000)
      return Response.json({ error: "Request too large" }, { status: 413 });
    try {
      body = JSON.parse(text || "{}");
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
  }
  const headers: Record<string, string> = Object.fromEntries(request.headers);
  let status = 200;
  const outputHeaders = new Headers();
  let result = "";
  const input = { url: request.url, method: request.method, headers, body };
  const output = {
    setHeader(name: string, value: string) {
      outputHeaders.set(name, value);
    },
    writeHead(code: number, values: Record<string, string>) {
      status = code;
      Object.entries(values || {}).forEach(([name, value]) =>
        outputHeaders.set(name, value),
      );
    },
    end(value?: string) {
      result = value || "";
    },
  };
  await handleSync(input, output);
  return new Response(result || null, { status, headers: outputHeaders });
}
export const GET = handle;
export const POST = handle;

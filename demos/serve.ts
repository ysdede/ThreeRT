// Serves a built demos folder on localhost (WebGPU needs localhost or https); a folder answers with its index.html.
//   node demos/serve.ts [out/demos] [port]
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { repoRoot } from "../tools/bundle-game.ts";

const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".wasm": "application/wasm", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".glb": "model/gltf-binary", ".svg": "image/svg+xml", ".woff2": "font/woff2" };

export function serve(dir: string, port: number): Promise<string> {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
    let file = join(dir, path);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!file.startsWith(dir) || !existsSync(file)) return void res.writeHead(404).end("not found");
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream", "content-length": statSync(file).size, "cache-control": "no-store" });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(port, "127.0.0.1", () => ok(`http://localhost:${(server.address() as { port: number }).port}/`)));
}

if (import.meta.main) {
  const [dir = "out/demos", port = "8787"] = process.argv.slice(2);
  console.log(`serving ${dir} at ${await serve(resolve(repoRoot, dir), Number(port))} (Ctrl-C stops it)`);
}

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT) || 3000;
// Fonctionne depuis src/ (dev) comme depuis dist/ (prod)
const publicDir = fileURLToPath(new URL("../public/", import.meta.url));

const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");

  // --- API ---
  if (url.pathname === "/api/hello") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: "Bonjour depuis le serveur", date: new Date() }));
    return;
  }

  // --- Fichiers statiques ---
  const path = url.pathname === "/" ? "/index.html" : url.pathname;
  const file = join(publicDir, normalize(path));

  if (!file.startsWith(publicDir)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const data = await readFile(file);
    res.writeHead(200, {
      "Content-Type": mimeTypes[extname(file)] ?? "application/octet-stream",
    });
    res.end(data);
  } catch {
    res.writeHead(404).end("Not found");
  }
});

server.listen(port, "0.0.0.0", () => console.log(`http://localhost:${port}`));
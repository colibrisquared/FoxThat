const http = require("http");
const os = require("os");

http.createServer((req, res) => {
  const total = os.totalmem();
  const used = total - os.freemem();
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*", // autorise ta page à lire la réponse
  });
  res.end(JSON.stringify({ used, total }));
}).listen(3001, "127.0.0.1");
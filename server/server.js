// Landing + salida a WhatsApp desde nuestro propio dominio.
// Sin dependencias: solo el http de Node. La pagina NUNCA contiene un link
// de WhatsApp; el boton pega contra /ir y el servidor redirige. Asi el
// numero no queda expuesto en el HTML y el clic se cuenta del lado servidor,
// donde no lo frena un bloqueador.
const http = require("http");
const fs = require("fs");
const path = require("path");
const stats = require("./stats");

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || "";

// WA_PHONES: uno o varios numeros separados por coma, para repartir la carga.
// Acepta local ("1135734768") o internacional ("5491135734768").
const WA_LIST = String(process.env.WA_PHONES || process.env.WA_PHONE || "1135734768")
  .split(",")
  .map((s) => s.replace(/\D/g, ""))
  .filter(Boolean)
  .map((n) => (n.startsWith("54") ? n : "549" + n.replace(/^9/, "")));

let waIdx = 0;
function waNext() {
  const n = WA_LIST[waIdx % WA_LIST.length];
  waIdx = (waIdx + 1) % (WA_LIST.length * 1000);
  return n;
}

const TEXTO = process.env.WA_TEXTO || "Hola! Quiero crear mi usuario y aprovechar el 200% de bono";

const DIR = path.join(__dirname, "..", "landing");
const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const u = url.pathname;
  const q = url.searchParams;

  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*" });
    return res.end();
  }

  if (u === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true, wa_lineas: WA_LIST.length }));
  }

  // La baliza va ANTES del filtro de metodo a proposito: sendBeacon manda POST,
  // asi que exigir GET aca la rechazaba con 405 y la permanencia nunca se contaba.
  if (u === "/ok" && (req.method === "POST" || req.method === "GET")) {
    stats.track("e", req, q.get("ref"));
    res.writeHead(204, { "Cache-Control": "no-store" });
    return res.end();
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD, POST, OPTIONS" });
    return res.end();
  }

  // salida a WhatsApp
  if (u === "/ir") {
    stats.track("c", req, q.get("ref"));
    const ref = (q.get("ref") || "").replace(/[^\w-]/g, "").slice(0, 20);
    const texto = TEXTO + (ref ? " (ref " + ref + ")" : "");
    const dest =
      "https://api.whatsapp.com/send?phone=" + waNext() + "&text=" + encodeURIComponent(texto);
    res.writeHead(302, {
      Location: dest,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    });
    return res.end();
  }

  // panel de metricas, protegido por clave
  if (u === "/stats" || u === "/api/stats") {
    if (!ADMIN_KEY || q.get("key") !== ADMIN_KEY) {
      res.writeHead(401, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: false, error: "clave invalida" }));
    }
    const data = stats.reporte(q.get("dias"));
    if (u === "/api/stats") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true, ...data }));
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(stats.panelHTML(data));
  }

  // estaticos de la landing
  const rel = u === "/" ? "index.html" : u.slice(1).replace(/\.\./g, "");
  if (rel === "index.html") {
    stats.track("v", req, q.get("utm_content") || q.get("utm_campaign") || q.get("ref"), q.get("fbclid"));
  }
  const ext = rel.slice(rel.lastIndexOf("."));
  const file = path.join(DIR, rel);
  if (!file.startsWith(DIR)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: false, error: "no encontrado" }));
    }
    res.writeHead(200, {
      "Content-Type": TIPOS[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=86400",
    });
    res.end(req.method === "HEAD" ? undefined : buf);
  });
});

server.listen(PORT, () => {
  console.log("landing en puerto " + PORT + " | lineas WA: " + WA_LIST.length);
});

// Metricas propias, sin cookies ni scripts de terceros: se cuenta del lado del
// servidor, asi que no lo frenan los bloqueadores. Persiste en disco de forma
// best-effort; en un plan sin disco el archivo se pierde al reiniciar y el
// panel simplemente arranca de cero.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ARCHIVO = process.env.STATS_FILE || path.join("/tmp", "stats-landing.json");
const MAX_EVENTOS = 5000;

let datos = { eventos: [] };
try {
  datos = JSON.parse(fs.readFileSync(ARCHIVO, "utf8"));
  if (!Array.isArray(datos.eventos)) datos = { eventos: [] };
} catch (e) {
  datos = { eventos: [] };
}

let pendiente = false;
function guardar() {
  if (pendiente) return;
  pendiente = true;
  setTimeout(() => {
    pendiente = false;
    try {
      fs.writeFileSync(ARCHIVO, JSON.stringify(datos));
    } catch (e) {
      // sin disco escribible el panel sigue andando en memoria
    }
  }, 2000).unref();
}

function ip(req) {
  return (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
}

// Huella por persona: no guardamos la IP cruda, solo un hash corto. Alcanza
// para no contar diez veces al mismo visitante y no es un dato identificable.
function huella(req) {
  const base = ip(req) + "|" + (req.headers["user-agent"] || "");
  return crypto.createHash("sha256").update(base).digest("hex").slice(0, 12);
}

// kind: "v" visita, "e" permanencia (2s), "c" clic al boton
function track(kind, req, ref, fbclid) {
  const ua = String(req.headers["user-agent"] || "");
  // los rastreadores no son personas: no ensucian las metricas
  if (/bot|crawler|spider|preview|facebookexternalhit|headless/i.test(ua)) return;
  datos.eventos.push({
    k: kind,
    t: Date.now(),
    p: huella(req),
    ref: String(ref || "").replace(/[^\w-]/g, "").slice(0, 20),
    fb: fbclid ? 1 : 0,
  });
  if (datos.eventos.length > MAX_EVENTOS) {
    datos.eventos = datos.eventos.slice(-MAX_EVENTOS);
  }
  guardar();
}

function reporte(dias) {
  const n = Math.min(Math.max(parseInt(dias || "7", 10) || 7, 1), 90);
  const desde = Date.now() - n * 86400000;
  const ev = datos.eventos.filter((e) => e.t >= desde);
  const cuenta = (k) => ev.filter((e) => e.k === k).length;
  const personas = new Set(ev.filter((e) => e.k === "v").map((e) => e.p)).size;
  const clics = cuenta("c");
  const visitas = cuenta("v");

  const porRef = {};
  ev.forEach((e) => {
    const r = e.ref || "(sin ref)";
    if (!porRef[r]) porRef[r] = { ref: r, visitas: 0, clics: 0 };
    if (e.k === "v") porRef[r].visitas++;
    if (e.k === "c") porRef[r].clics++;
  });

  return {
    dias: n,
    visitas,
    personas,
    permanencia: cuenta("e"),
    clics,
    // porcentaje de visitas que terminan tocando el boton
    convierte: visitas ? Math.round((clics / visitas) * 1000) / 10 : 0,
    refs: Object.values(porRef).sort((a, b) => b.visitas - a.visitas).slice(0, 25),
  };
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function panelHTML(d) {
  const filas = d.refs
    .map(
      (r) =>
        "<tr><td>" + esc(r.ref) + "</td><td>" + r.visitas + "</td><td>" + r.clics + "</td><td>" +
        (r.visitas ? Math.round((r.clics / r.visitas) * 1000) / 10 : 0) + "%</td></tr>"
    )
    .join("");
  return (
    "<!doctype html><html lang=es><meta charset=utf-8>" +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Metricas</title>' +
    "<style>body{background:#0c0c0e;color:#eee;font:15px system-ui;margin:0;padding:22px}" +
    "h1{font-size:19px;margin:0 0 16px}h2{font-size:14px;color:#8f8f96;margin:26px 0 8px;text-transform:uppercase;letter-spacing:.1em}" +
    ".g{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:11px}" +
    ".c{background:#16161a;border:1px solid #26262c;border-radius:12px;padding:14px}" +
    ".c b{display:block;font-size:26px;color:#e8543f}.c span{font-size:12px;color:#8f8f96}" +
    "table{width:100%;border-collapse:collapse;margin-top:6px;font-size:14px}" +
    "th,td{text-align:left;padding:9px 10px;border-bottom:1px solid #26262c}th{color:#8f8f96;font-weight:600;font-size:12px}" +
    ".n{color:#6d6d75;font-size:12px;margin-top:20px;line-height:1.5}</style>" +
    "<h1>Metricas &middot; ultimos " + d.dias + " dias</h1>" +
    '<div class=g><div class=c><b>' + d.visitas + "</b><span>visitas</span></div>" +
    "<div class=c><b>" + d.personas + "</b><span>personas</span></div>" +
    "<div class=c><b>" + d.permanencia + "</b><span>se quedaron 2s</span></div>" +
    "<div class=c><b>" + d.clics + "</b><span>clics al boton</span></div>" +
    "<div class=c><b>" + d.convierte + "%</b><span>convierte</span></div></div>" +
    "<h2>Por codigo de anuncio</h2><table><tr><th>Ref</th><th>Visitas</th><th>Clics</th><th>Convierte</th></tr>" +
    (filas || '<tr><td colspan=4 style="color:#6d6d75">todavia sin datos</td></tr>') +
    "</table>" +
    '<p class=n>Se cuenta del lado del servidor, sin cookies ni scripts en la landing: no lo frenan los bloqueadores. ' +
    "Los rastreadores quedan afuera. La IP no se guarda, solo un hash corto para no contar dos veces a la misma persona.</p>" +
    "</html>"
  );
}

module.exports = { track, reporte, panelHTML, ARCHIVO };

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const ROOT = path.join(__dirname, "public");

const routes = {
  "/": "index.html",
  "/methode-pronostics-sportifs": "methode.html",
  "/value-bet": "value-bet.html",
  "/gestion-bankroll": "bankroll.html"
};

function origin(req) {
  const proto = (req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  return proto + "://" + req.headers.host;
}

function send(res, status, type, body) {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": status === 200 ? "public, max-age=300" : "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "strict-origin-when-cross-origin"
  });
  res.end(body);
}

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/health") return send(res, 200, "application/json; charset=utf-8", JSON.stringify({status:"ok"}));

  if (url.pathname === "/robots.txt") {
    const base = origin(req);
    return send(res, 200, "text/plain; charset=utf-8", "User-agent: *\nAllow: /\nSitemap: " + base + "/sitemap.xml\n");
  }

  if (url.pathname === "/sitemap.xml") {
    const base = origin(req);
    const pages = ["/","/methode-pronostics-sportifs","/value-bet","/gestion-bankroll"];
    const xml = '<?xml version="1.0" encoding="UTF-8"?>' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      pages.map(p => '<url><loc>' + base + p + '</loc><changefreq>weekly</changefreq><priority>' + (p === "/" ? "1.0" : "0.8") + '</priority></url>').join("") +
      '</urlset>';
    return send(res, 200, "application/xml; charset=utf-8", xml);
  }

  const file = routes[url.pathname];
  if (!file) return send(res, 404, "text/html; charset=utf-8", "<h1>404</h1><p>Page introuvable.</p>");

  try {
    let html = fs.readFileSync(path.join(ROOT, file), "utf8");
    html = html.replaceAll("__ORIGIN__", origin(req));
    return send(res, 200, "text/html; charset=utf-8", html);
  } catch (e) {
    return send(res, 500, "text/plain; charset=utf-8", "Erreur interne");
  }
}).listen(PORT, "0.0.0.0", () => console.log("pronostics site listening on " + PORT));

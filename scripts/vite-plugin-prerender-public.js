import fs from "node:fs";
import path from "node:path";
import { PRERENDER_PAGES, SITE_URL } from "../src/content/prerenderPages.js";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function canonicalFor(pagePath) {
  if (pagePath === "/") return `${SITE_URL}/`;
  return `${SITE_URL}${pagePath}`;
}

function replaceTagContent(html, tag, value) {
  const re = new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, "i");
  return html.replace(re, `<${tag}>${escapeHtml(value)}</${tag}>`);
}

function replaceMetaContent(html, key, keyValue, content) {
  const escaped = escapeHtml(content);
  const named = new RegExp(
    `(<meta[^>]*${key}="${keyValue}"[^>]*content=")[^"]*(")`,
    "i"
  );
  if (named.test(html)) return html.replace(named, `$1${escaped}$2`);
  const reversed = new RegExp(
    `(<meta[^>]*content=")[^"]*("[^>]*${key}="${keyValue}")`,
    "i"
  );
  return html.replace(reversed, `$1${escaped}$2`);
}

function replaceCanonical(html, href) {
  return html.replace(
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i,
    `<link rel="canonical" href="${escapeHtml(href)}" />`
  );
}

function findRootClose(html, start) {
  const openTag = '<div id="root">';
  let index = start + openTag.length;
  let depth = 1;
  while (index < html.length) {
    const nextOpen = html.indexOf("<div", index);
    const nextClose = html.indexOf("</div>", index);
    if (nextClose === -1) return html.length;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      index = nextOpen + 4;
      continue;
    }
    depth -= 1;
    if (depth === 0) return nextClose + "</div>".length;
    index = nextClose + 6;
  }
  return html.length;
}

function replaceRoot(html, body) {
  const openTag = '<div id="root">';
  const start = html.indexOf(openTag);
  if (start === -1) {
    return html.replace(
      /<div id="root"><\/div>/i,
      `<div id="root">${body}</div>`
    );
  }
  const end = findRootClose(html, start);
  return `${html.slice(0, start)}${openTag}${body}</div>${html.slice(end)}`;
}

function applyPage(html, page) {
  const canonical = canonicalFor(page.path);
  let next = html;
  next = replaceTagContent(next, "title", page.title);
  next = replaceMetaContent(next, "name", "description", page.description);
  next = replaceMetaContent(next, "property", "og:title", page.title);
  next = replaceMetaContent(next, "property", "og:description", page.description);
  next = replaceMetaContent(next, "property", "og:url", canonical);
  next = replaceMetaContent(next, "name", "twitter:title", page.title);
  next = replaceMetaContent(next, "name", "twitter:description", page.description);
  next = replaceCanonical(next, canonical);
  next = replaceRoot(next, page.body);
  return next;
}

function servePrerenderedPage(rootDir) {
  return (req, res, next) => {
    const url = String(req.url || "").split("?")[0];
    const page = PRERENDER_PAGES.find(
      (item) =>
        item.path !== "/" &&
        (url === item.path || url === `${item.path}/` || url === `${item.path}/index.html`)
    );
    if (!page) {
      next();
      return;
    }
    const file = path.join(rootDir, page.path.replace(/^\//, ""), "index.html");
    if (!fs.existsSync(file)) {
      next();
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(fs.readFileSync(file));
  };
}

export function prerenderPublicPages() {
  return {
    name: "prerender-public-pages",
    configurePreviewServer(server) {
      server.middlewares.use(servePrerenderedPage(path.resolve("dist")));
    },
    transformIndexHtml(html) {
      const home = PRERENDER_PAGES.find((page) => page.path === "/");
      return home ? applyPage(html, home) : html;
    },
    closeBundle: {
      sequential: true,
      order: "post",
      handler() {
        const distDir = path.resolve("dist");
        const indexPath = path.join(distDir, "index.html");
        if (!fs.existsSync(indexPath)) return;
        const built = fs.readFileSync(indexPath, "utf8");
        for (const page of PRERENDER_PAGES) {
          const html = applyPage(built, page);
          if (page.path === "/") {
            fs.writeFileSync(indexPath, html);
            continue;
          }
          const dir = path.join(distDir, page.path.replace(/^\//, ""));
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, "index.html"), html);
        }
      },
    },
  };
}

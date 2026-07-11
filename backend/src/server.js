import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { pool, verifyDatabaseConnection } from "./db.js";
import { ensureSchema } from "./initSchema.js";
import authRoutes from "./routes/authRoutes.js";
import coverageRoutes from "./routes/coverageRoutes.js";
import creditRoutes from "./routes/creditRoutes.js";
import importRoutes from "./routes/importRoutes.js";
import papCredentialRoutes from "./routes/papCredentialRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import externalRoutes from "./routes/external/index.js";
import { mountSwaggerDocs } from "./docs/swagger.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4000);
const ALLOWED_METHODS = ["GET", "POST", "PATCH", "DELETE"];

function normalizeOrigin(value) {
  return String(value || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/\]\(.*$/, "")
    .replace(/\/+$/, "");
}

const allowedOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:5173")
  .split(",")
  .map(normalizeOrigin)
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    const requestOrigin = normalizeOrigin(origin);
    if (allowedOrigins.includes(requestOrigin)) {
      callback(null, true);
      return;
    }

    // eslint-disable-next-line no-console
    console.warn(`[CORS] Origem bloqueada: ${origin} (normalizada: ${requestOrigin})`);
    callback(null, false);
  },
  methods: ALLOWED_METHODS,
  allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"],
  optionsSuccessStatus: 204,
  maxAge: 86_400,
};

function applyCorsHeaders(req, res) {
  const origin = normalizeOrigin(req.headers.origin);
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS.join(", "));
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");
}

app.use(cors(corsOptions));
app.use((req, res, next) => {
  applyCorsHeaders(req, res);
  next();
});
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "10mb" }));

app.get("/", (_req, res) => {
  res.json({
    service: "Plano Ideal API",
    docs: "/api/docs",
    health: "/api/health",
  });
});

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, database: "connected" });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[Health] Falha na conexão com o banco:", error);
    res.status(503).json({ ok: false, database: "disconnected" });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api", coverageRoutes);
app.use("/api", creditRoutes);
app.use("/api", papCredentialRoutes);
app.use("/api", importRoutes);
app.use("/api", userRoutes);
app.use("/api/v1/external", externalRoutes);

app.use((error, req, res, _next) => {
  applyCorsHeaders(req, res);
  // eslint-disable-next-line no-console
  console.error("[API] Erro não tratado:", error);
  res.status(500).json({ message: "Erro interno do servidor." });
});

async function bootstrap() {
  // eslint-disable-next-line no-console
  console.log("[API] Iniciando Plano Ideal API…");
  // eslint-disable-next-line no-console
  console.log(`[CORS] Origens permitidas: ${JSON.stringify(allowedOrigins)}`);

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL não configurada — impossível iniciar a API.");
  }

  if (!process.env.JWT_SECRET) {
    // eslint-disable-next-line no-console
    console.warn("[API] JWT_SECRET não definido — rotas autenticadas falharão.");
  }

  try {
    await verifyDatabaseConnection();
    await ensureSchema();
    await mountSwaggerDocs(app);
    // eslint-disable-next-line no-console
    console.log("[DB] Schema verificado e pronto.");
    // eslint-disable-next-line no-console
    console.log("[Docs] Swagger UI disponível em /api/docs");
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[DB] Falha ao conectar ou inicializar schema:", error);
    throw error;
  }

  app.listen(port, "0.0.0.0", () => {
    // eslint-disable-next-line no-console
    console.log(`[API] Servidor escutando em 0.0.0.0:${port}`);
  });
}

process.on("unhandledRejection", (reason) => {
  // eslint-disable-next-line no-console
  console.error("[API] unhandledRejection:", reason);
});

process.on("uncaughtException", (error) => {
  // eslint-disable-next-line no-console
  console.error("[API] uncaughtException:", error);
  process.exit(1);
});

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("[API] Falha fatal no startup:", error);
  process.exit(1);
});

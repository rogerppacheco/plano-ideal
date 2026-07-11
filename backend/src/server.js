import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { ensureSchema } from "./initSchema.js";
import authRoutes from "./routes/authRoutes.js";
import coverageRoutes from "./routes/coverageRoutes.js";
import creditRoutes from "./routes/creditRoutes.js";
import importRoutes from "./routes/importRoutes.js";
import papCredentialRoutes from "./routes/papCredentialRoutes.js";
import userRoutes from "./routes/userRoutes.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4000);

function normalizeOrigin(value) {
  return String(value || "").trim().replace(/\/+$/, "");
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
    console.warn(`[CORS] Origem bloqueada: ${origin}`);
    callback(null, false);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "10mb" }));

app.get("/", (_req, res) => {
  res.json({
    service: "Plano Ideal API",
    docs: "Rotas em /api/*",
    health: "/api/health",
  });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRoutes);
app.use("/api", coverageRoutes);
app.use("/api", creditRoutes);
app.use("/api", papCredentialRoutes);
app.use("/api", importRoutes);
app.use("/api", userRoutes);

app.use((error, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error(error);
  res.status(500).json({ message: "Erro interno do servidor." });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`[CORS] Origens permitidas: ${JSON.stringify(allowedOrigins)}`);
  // eslint-disable-next-line no-console
  console.log(`API rodando em http://localhost:${port}`);
});

ensureSchema().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Falha ao inicializar schema:", error);
});

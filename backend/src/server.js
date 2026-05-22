import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { ensureSchema } from "./initSchema.js";
import authRoutes from "./routes/authRoutes.js";
import coverageRoutes from "./routes/coverageRoutes.js";
import importRoutes from "./routes/importRoutes.js";
import userRoutes from "./routes/userRoutes.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  })
);
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRoutes);
app.use("/api", coverageRoutes);
app.use("/api", importRoutes);
app.use("/api", userRoutes);

app.use((error, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error(error);
  res.status(500).json({ message: "Erro interno do servidor." });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`API rodando em http://localhost:${port}`);
});

ensureSchema().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Falha ao inicializar schema:", error);
});

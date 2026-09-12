import { Router } from "express";
import { supabase } from "../config.js";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", uptimeSeconds: Math.round(process.uptime()) });
});

healthRouter.get("/ready", async (_req, res) => {
  try {
    const { error } = await supabase.from("shop_config").select("id").eq("id", 1).maybeSingle();
    if (error) {
      res.status(503).json({ status: "not_ready", reason: "database_unreachable" });
      return;
    }
    res.status(200).json({ status: "ready" });
  } catch {
    res.status(503).json({ status: "not_ready", reason: "database_unreachable" });
  }
});

import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Test endpoint to verify API is working
  app.get("/api/test", (req, res) => {
    res.json({ message: "API is working", data: "Test successful" });
  });

  // Chat endpoints could be added here in the future
  // app.post("/api/chat", async (req, res) => {
  //   // Handle chat messages if needed
  // });

  const httpServer = createServer(app);

  return httpServer;
}

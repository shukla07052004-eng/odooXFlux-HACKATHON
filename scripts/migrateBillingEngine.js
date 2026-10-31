import "dotenv/config";
import { readFile } from "node:fs/promises";
import pool from "../lib/db.js";

const migration = await readFile(new URL("../database/migrations/20261101_billing_engine.sql", import.meta.url), "utf8");
const client = await pool.connect();
try {
  await client.query(migration);
  console.log("Billing automation schema is ready.");
} catch (error) {
  console.error("Billing migration failed:", error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}

import "dotenv/config";
import { readFile } from "node:fs/promises";
import pool from "../lib/db.js";

async function migrateAuth() {
  const migration = await readFile(new URL("../database/migrations/20261031_auth_fields.sql", import.meta.url), "utf8");
  const client = await pool.connect();
  try {
    await client.query(migration);
    console.log("Authentication columns and indexes are ready.");
  } catch (error) {
    console.error("Authentication migration failed:", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

await migrateAuth();

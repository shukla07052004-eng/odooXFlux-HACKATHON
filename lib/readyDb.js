import "dotenv/config";
import { readFile } from "node:fs/promises";
import { Client } from "pg";
import pool from "../lib/db.js";

export async function ensureDatabaseReady() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set.");
  }

  const databaseUrl = new URL(connectionString);
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\/+/, ""));
  if (!databaseName) {
    throw new Error("DATABASE_URL must include a database name.");
  }

  const maintenanceUrl = new URL(connectionString);
  maintenanceUrl.pathname = "/postgres";
  const maintenanceClient = new Client({
    connectionString: maintenanceUrl.toString(),
  });

  let databaseCreated = false;
  await maintenanceClient.connect();
  try {
    const result = await maintenanceClient.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [databaseName]
    );

    if (result.rowCount === 0) {
      const quotedDatabaseName = `"${databaseName.replaceAll('"', '""')}"`;
      try {
        await maintenanceClient.query(`CREATE DATABASE ${quotedDatabaseName}`);
      } catch (error) {
        throw new Error(
          `Could not create database "${databaseName}". Ensure the PostgreSQL user has CREATEDB permission.`,
          { cause: error }
        );
      }
      databaseCreated = true;
    }
  } finally {
    await maintenanceClient.end();
  }

  const schemaResult = await pool.query(
    "SELECT to_regclass('public.users') AS users_table"
  );
  if (schemaResult.rows[0].users_table) {
    return;
  }

  const schema = await readFile(
    new URL("../database/schema.sql", import.meta.url),
    "utf8"
  );
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(schema);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  if (databaseCreated) {
    console.log("Database created and schema initialized.");
  } else {
    console.log("Database schema initialized.");
  }
}
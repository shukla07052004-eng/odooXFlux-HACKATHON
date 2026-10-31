import "dotenv/config";
import bcrypt from "bcryptjs";
import pool from "../lib/db.js";
import { ensureDatabaseReady } from "../lib/readyDb.js";


async function createAdmin() {
  try {
    await ensureDatabaseReady();

    const name = "System Admin";
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;

    if (!email || !password) {
      throw new Error("Admin credentials are missing.");
    }

    // Check whether admin already exists
    const existing = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (existing.rows.length > 0) {
      console.log("Admin account already exists.");
      return;
    }

    // Hash the password
    const passwordHash = await bcrypt.hash(password, 12);

    // Insert the first admin
    await pool.query(
      `INSERT INTO users
       (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'admin')`,
      [name, email, passwordHash]
    );

    console.log("Initial admin created successfully.");
  } catch (error) {
    console.error("Admin creation failed:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

createAdmin();

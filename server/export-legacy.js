// Local administrator export only. Never exposed as a public HTTP endpoint.
const fs = require("node:fs");
const db = require("./db");
const output = process.argv[2];
if (!output) {
  console.error("Usage: node export-legacy.js <new-output.json>");
  db.close();
  process.exitCode = 1;
} else
  db.all("SELECT * FROM transactions ORDER BY date", (error, rows) => {
    try {
      if (error) throw error;
      fs.writeFileSync(
        output,
        JSON.stringify({ version: "legacy", transactions: rows }, null, 2),
        { flag: "wx", mode: 0o600 },
      );
      console.log(
        `Exported ${rows.length} legacy records. Keep this plaintext archive private.`,
      );
    } catch (e) {
      console.error(e.message);
      process.exitCode = 1;
    } finally {
      db.close();
    }
  });

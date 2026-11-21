import { readdirSync } from "node:fs";

const migrationsDirectory = new URL("../migrations/", import.meta.url);
const migrations = readdirSync(migrationsDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
  .map((entry) => entry.name)
  .sort();
const migrationsByVersion = new Map();

console.log(`Checking ${migrations.length} D1 migration(s):`);

for (const filename of migrations) {
  console.log(`  ${filename}`);
  const match = /^(\d+)_.+\.sql$/.exec(filename);
  if (!match) {
    console.error(`Invalid migration filename: ${filename}. Expected <version>_<name>.sql.`);
    process.exitCode = 1;
    continue;
  }

  const version = BigInt(match[1]);
  const previous = migrationsByVersion.get(version);
  if (previous) {
    console.error(`Duplicate migration version ${match[1]}: ${previous} and ${filename}`);
    process.exitCode = 1;
    continue;
  }

  migrationsByVersion.set(version, filename);
}

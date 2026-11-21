import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(backendDir, "..");
const wranglerBin = path.join(
  backendDir,
  "node_modules",
  "wrangler",
  "bin",
  "wrangler.js",
);

const wranglerEnv = {
  ...process.env,
  XDG_CONFIG_HOME: path.join(repoRoot, ".wrangler-config"),
  WRANGLER_SEND_METRICS: "false",
};

function runWrangler(args) {
  if (fs.existsSync(wranglerBin)) {
    execFileSync(process.execPath, [wranglerBin, ...args], {
      cwd: backendDir,
      env: wranglerEnv,
      stdio: "inherit",
    });
    return;
  }
  execFileSync("npx", ["wrangler", ...args], {
    cwd: backendDir,
    env: wranglerEnv,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

function sqlText(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

const DEMO_ROWS = [
  {
    id: "txn_demo_202611_01",
    transaction_date: "2026-11-01",
    type: "income",
    amount_minor: 25000000,
    category_id: "salary",
    merchant: "Monthly Salary",
    note: "November payroll deposit",
    source: "dashboard",
    created_at: "2026-11-01T02:00:00Z",
  },
  {
    id: "txn_demo_202611_02",
    transaction_date: "2026-11-02",
    type: "expense",
    amount_minor: 8200000,
    category_id: "housing",
    merchant: "Apartment Rent",
    note: "November rent and building fee",
    source: "dashboard",
    created_at: "2026-11-02T03:15:00Z",
  },
  {
    id: "txn_demo_202611_03",
    transaction_date: "2026-11-05",
    type: "expense",
    amount_minor: 1450000,
    category_id: "utilities",
    merchant: "EVN & Fiber Internet",
    note: "Electricity + home fiber plan",
    source: "dashboard",
    created_at: "2026-11-05T07:30:00Z",
  },
  {
    id: "txn_demo_202611_04",
    transaction_date: "2026-11-07",
    type: "expense",
    amount_minor: 685000,
    category_id: "groceries",
    merchant: "Annam Gourmet",
    note: "Weekly pantry and fresh produce",
    source: "telegram",
    created_at: "2026-11-07T11:20:00Z",
  },
  {
    id: "txn_demo_202611_05",
    transaction_date: "2026-11-09",
    type: "transfer",
    amount_minor: 3000000,
    category_id: null,
    merchant: "Savings Vault",
    note: "Monthly automated savings transfer",
    source: "dashboard",
    created_at: "2026-11-09T04:00:00Z",
  },
  {
    id: "txn_demo_202611_06",
    transaction_date: "2026-11-11",
    type: "expense",
    amount_minor: 420000,
    category_id: "shopping",
    merchant: "Uniqlo",
    note: "Cotton T-shirt",
    source: "telegram",
    created_at: "2026-11-11T12:10:00Z",
  },
  {
    id: "txn_demo_202611_07",
    transaction_date: "2026-11-12",
    type: "refund",
    amount_minor: 120000,
    category_id: "shopping",
    merchant: "Uniqlo",
    note: "Size exchange partial refund",
    source: "agent",
    created_at: "2026-11-12T08:45:00Z",
  },
  {
    id: "txn_demo_202611_08",
    transaction_date: "2026-11-14",
    type: "income",
    amount_minor: 3500000,
    category_id: "salary",
    merchant: "Design Advisory",
    note: "Weekend consulting invoice",
    source: "agent",
    created_at: "2026-11-14T09:00:00Z",
  },
  {
    id: "txn_demo_202611_09",
    transaction_date: "2026-11-15",
    type: "expense",
    amount_minor: 280000,
    category_id: "health",
    merchant: "Pharmacity",
    note: "Vitamins and bandages",
    source: "telegram",
    created_at: "2026-11-15T10:15:00Z",
  },
  {
    id: "txn_demo_202611_10",
    transaction_date: "2026-11-16",
    type: "expense",
    amount_minor: 165000,
    category_id: "transport",
    merchant: "GrabCar",
    note: "Airport pickup",
    source: "agent",
    created_at: "2026-11-16T06:50:00Z",
  },
  {
    id: "txn_demo_202611_11",
    transaction_date: "2026-11-17",
    type: "expense",
    amount_minor: 55000,
    category_id: "food",
    merchant: "Highlands Coffee",
    note: "Iced coffee and banh mi",
    source: "telegram",
    created_at: "2026-11-17T02:20:00Z",
  },
  {
    id: "txn_demo_202611_12",
    transaction_date: "2026-11-18",
    type: "expense",
    amount_minor: 310000,
    category_id: "entertainment",
    merchant: "CGV Cinemas",
    note: "Two evening movie tickets",
    source: "telegram",
    created_at: "2026-11-18T13:05:00Z",
  },
  {
    id: "txn_demo_202611_13",
    transaction_date: "2026-11-19",
    type: "expense",
    amount_minor: 95000,
    category_id: null,
    merchant: "Local Market",
    note: "Cash purchase without category",
    source: "agent",
    created_at: "2026-11-19T05:10:00Z",
  },
  {
    id: "txn_demo_202610_01",
    transaction_date: "2026-10-01",
    type: "income",
    amount_minor: 24000000,
    category_id: "salary",
    merchant: "Monthly Salary",
    note: "October payroll deposit",
    source: "dashboard",
    created_at: "2026-10-01T02:00:00Z",
  },
  {
    id: "txn_demo_202610_02",
    transaction_date: "2026-10-03",
    type: "expense",
    amount_minor: 8200000,
    category_id: "housing",
    merchant: "Apartment Rent",
    note: "October rent",
    source: "dashboard",
    created_at: "2026-10-03T04:00:00Z",
  },
  {
    id: "txn_demo_202610_03",
    transaction_date: "2026-10-14",
    type: "expense",
    amount_minor: 240000,
    category_id: "subscriptions",
    merchant: "Cloud Storage",
    note: "Historical row using archived category",
    source: "agent",
    created_at: "2026-10-14T08:00:00Z",
  },
  {
    id: "txn_demo_202610_04",
    transaction_date: "2026-10-22",
    type: "expense",
    amount_minor: 490000,
    category_id: "food",
    merchant: "Pizza 4P's",
    note: "Dinner with friends",
    source: "telegram",
    created_at: "2026-10-22T12:30:00Z",
  },
];

function main() {
  const statements = [
    `INSERT INTO categories (id, name, archived_at) VALUES ('subscriptions', 'Đăng ký định kỳ', '2026-11-01T00:00:00Z') ON CONFLICT(id) DO UPDATE SET name = excluded.name;`,
    ...DEMO_ROWS.map(
      (row) =>
        `INSERT OR IGNORE INTO transactions (id, transaction_date, type, amount_minor, currency_code, category_id, merchant, note, source, created_by_client_id, created_at, updated_at, deleted_at) VALUES (${sqlText(row.id)}, ${sqlText(row.transaction_date)}, ${sqlText(row.type)}, ${row.amount_minor}, 'VND', ${sqlText(row.category_id)}, ${sqlText(row.merchant)}, ${sqlText(row.note)}, ${sqlText(row.source)}, NULL, ${sqlText(row.created_at)}, ${sqlText(row.created_at)}, NULL);`,
    ),
  ];

  const tempSqlPath = path.join(backendDir, ".tmp-seed-demo.sql");
  fs.writeFileSync(tempSqlPath, `${statements.join("\n")}\n`, "utf8");

  try {
    console.log("Seeding local D1 demo transactions...");
    runWrangler([
      "d1",
      "execute",
      "expense-tracker-local",
      "--local",
      "--config",
      "wrangler.integration.jsonc",
      "--persist-to",
      "../.wrangler/state",
      "--file",
      tempSqlPath,
    ]);
  } finally {
    if (fs.existsSync(tempSqlPath)) {
      fs.unlinkSync(tempSqlPath);
    }
  }

  console.log(`Seeded ${DEMO_ROWS.length} sample transactions (idempotent).`);
}

main();

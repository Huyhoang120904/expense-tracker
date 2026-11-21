INSERT OR IGNORE INTO settings (id, currency_code, timezone)
VALUES (1, 'VND', 'Asia/Ho_Chi_Minh');

INSERT OR IGNORE INTO categories (id, name, archived_at) VALUES
  ('food', 'Food', NULL),
  ('groceries', 'Groceries', NULL),
  ('transport', 'Transport', NULL),
  ('housing', 'Housing', NULL),
  ('utilities', 'Utilities', NULL),
  ('health', 'Health', NULL),
  ('entertainment', 'Entertainment', NULL),
  ('shopping', 'Shopping', NULL),
  ('salary', 'Salary', NULL),
  ('other', 'Other', NULL);

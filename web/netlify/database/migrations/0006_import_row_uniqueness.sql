-- Fail rather than silently delete existing financial records if duplicates exist.
CREATE UNIQUE INDEX "financial_transactions_import_row_unique"
  ON "financial_transactions" ("import_row_id");

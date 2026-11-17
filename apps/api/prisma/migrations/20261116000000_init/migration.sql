-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "asset_class" AS ENUM ('crypto', 'stock', 'forex', 'commodity');

-- CreateEnum
CREATE TYPE "order_side" AS ENUM ('buy', 'sell');

-- CreateEnum
CREATE TYPE "order_type" AS ENUM ('market');

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('pending', 'filled', 'rejected');

-- CreateEnum
CREATE TYPE "order_reject_reason" AS ENUM ('insufficient_funds', 'insufficient_position', 'invalid_quantity', 'no_price', 'market_closed', 'stale_price');

-- CreateEnum
CREATE TYPE "position_side" AS ENUM ('long', 'short');

-- CreateEnum
CREATE TYPE "ledger_entry_type" AS ENUM ('initial_deposit', 'trade_buy', 'trade_sell');

-- CreateEnum
CREATE TYPE "leaderboard_cutoff" AS ENUM ('two_day', 'thirty_day');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "login_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "credential_hash" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitions" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "initial_balance" DECIMAL(20,2) NOT NULL,
    "leverage" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "competition_id" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "initial_balance" DECIMAL(20,2) NOT NULL,
    "balance" DECIMAL(20,2) NOT NULL,
    "leverage" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instruments" (
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "asset_class" "asset_class" NOT NULL,
    "quote_currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "price_precision" INTEGER NOT NULL,
    "quantity_precision" INTEGER NOT NULL,
    "min_quantity" DECIMAL(28,8) NOT NULL,
    "tradable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "instruments_pkey" PRIMARY KEY ("symbol")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "client_order_id" UUID,
    "symbol" TEXT NOT NULL,
    "side" "order_side" NOT NULL,
    "type" "order_type" NOT NULL DEFAULT 'market',
    "quantity" DECIMAL(28,8) NOT NULL,
    "status" "order_status" NOT NULL DEFAULT 'pending',
    "reject_reason" "order_reject_reason",
    "filled_price" DECIMAL(20,8),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filled_at" TIMESTAMPTZ(3),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" "position_side" NOT NULL DEFAULT 'long',
    "quantity" DECIMAL(28,8) NOT NULL,
    "cost_basis" DECIMAL(20,2) NOT NULL,
    "avg_entry_price" DECIMAL(20,8) NOT NULL,
    "realized_pnl" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "closed_at" TIMESTAMPTZ(3),

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fills" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" "order_side" NOT NULL,
    "quantity" DECIMAL(28,8) NOT NULL,
    "price" DECIMAL(20,8) NOT NULL,
    "notional" DECIMAL(20,2) NOT NULL,
    "realized_pnl" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "tick_bid" DECIMAL(20,8) NOT NULL,
    "tick_ask" DECIMAL(20,8) NOT NULL,
    "tick_ts" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" BIGSERIAL NOT NULL,
    "account_id" UUID NOT NULL,
    "type" "ledger_entry_type" NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "balance_after" DECIMAL(20,2) NOT NULL,
    "fill_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leaderboard_snapshots" (
    "id" UUID NOT NULL,
    "competition_id" UUID NOT NULL,
    "cutoff" "leaderboard_cutoff" NOT NULL,
    "taken_at" TIMESTAMPTZ(3) NOT NULL,
    "account_id" UUID NOT NULL,
    "rank" INTEGER NOT NULL,
    "equity" DECIMAL(20,2) NOT NULL,
    "return_pct" DECIMAL(12,6) NOT NULL,

    CONSTRAINT "leaderboard_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "account_id" UUID,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_login_id_key" ON "users"("login_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_user_id_key" ON "accounts"("user_id");

-- CreateIndex
CREATE INDEX "accounts_competition_id_idx" ON "accounts"("competition_id");

-- CreateIndex
CREATE INDEX "orders_account_id_created_at_idx" ON "orders"("account_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_account_id_client_order_id_key" ON "orders"("account_id", "client_order_id");

-- CreateIndex
CREATE INDEX "positions_account_id_closed_at_idx" ON "positions"("account_id", "closed_at");

-- CreateIndex
CREATE INDEX "positions_account_id_symbol_idx" ON "positions"("account_id", "symbol");

-- CreateIndex
CREATE UNIQUE INDEX "fills_order_id_key" ON "fills"("order_id");

-- CreateIndex
CREATE INDEX "fills_account_id_created_at_idx" ON "fills"("account_id", "created_at");

-- CreateIndex
CREATE INDEX "fills_position_id_idx" ON "fills"("position_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_fill_id_key" ON "ledger_entries"("fill_id");

-- CreateIndex
CREATE INDEX "ledger_entries_account_id_id_idx" ON "ledger_entries"("account_id", "id");

-- CreateIndex
CREATE INDEX "leaderboard_snapshots_competition_id_cutoff_taken_at_rank_idx" ON "leaderboard_snapshots"("competition_id", "cutoff", "taken_at", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "leaderboard_snapshots_competition_id_cutoff_taken_at_accoun_key" ON "leaderboard_snapshots"("competition_id", "cutoff", "taken_at", "account_id");

-- CreateIndex
CREATE INDEX "audit_log_account_id_created_at_idx" ON "audit_log"("account_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "instruments"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "instruments"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fills" ADD CONSTRAINT "fills_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fills" ADD CONSTRAINT "fills_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fills" ADD CONSTRAINT "fills_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fills" ADD CONSTRAINT "fills_symbol_fkey" FOREIGN KEY ("symbol") REFERENCES "instruments"("symbol") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_fill_id_fkey" FOREIGN KEY ("fill_id") REFERENCES "fills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaderboard_snapshots" ADD CONSTRAINT "leaderboard_snapshots_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "competitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leaderboard_snapshots" ADD CONSTRAINT "leaderboard_snapshots_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------------------------
-- Reglas que Prisma no expresa en `schema.prisma`. Escritas a mano por el Agente Backend.
-- ---------------------------------------------------------------------------------------------

-- Una sola posición abierta por cuenta y símbolo.
CREATE UNIQUE INDEX "positions_open_account_symbol_key"
    ON "positions"("account_id", "symbol") WHERE "closed_at" IS NULL;

-- El saldo y las cantidades nunca son negativos (V0: 1:1, solo largos).
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_balance_non_negative" CHECK ("balance" >= 0);
ALTER TABLE "positions" ADD CONSTRAINT "positions_quantity_non_negative" CHECK ("quantity" >= 0);
ALTER TABLE "positions" ADD CONSTRAINT "positions_cost_basis_non_negative" CHECK ("cost_basis" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_quantity_positive" CHECK ("quantity" > 0);

-- `ledger_entries` y `audit_log` son solo de inserción.
CREATE FUNCTION "forbid_mutation"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'La tabla % es solo de inserción: % no está permitido', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ledger_entries_append_only" BEFORE UPDATE OR DELETE ON "ledger_entries"
    FOR EACH ROW EXECUTE FUNCTION "forbid_mutation"();
CREATE TRIGGER "ledger_entries_no_truncate" BEFORE TRUNCATE ON "ledger_entries"
    FOR EACH STATEMENT EXECUTE FUNCTION "forbid_mutation"();
CREATE TRIGGER "audit_log_append_only" BEFORE UPDATE OR DELETE ON "audit_log"
    FOR EACH ROW EXECUTE FUNCTION "forbid_mutation"();
CREATE TRIGGER "audit_log_no_truncate" BEFORE TRUNCATE ON "audit_log"
    FOR EACH STATEMENT EXECUTE FUNCTION "forbid_mutation"();

import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import data from "../data/questions.json";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    GRANT USAGE ON SCHEMA auth TO anon, authenticated;
    INSERT INTO auth.users VALUES ('00000000-0000-4000-8000-000000000001'), ('00000000-0000-4000-8000-000000000002'), ('00000000-0000-4000-8000-000000000003');`);
  await db.exec(readFileSync("supabase/migrations/001_initial.sql", "utf8"));
  await db.exec(readFileSync("supabase/seed.sql", "utf8"));
  await db.exec(
    `INSERT INTO public.profiles VALUES ('00000000-0000-4000-8000-000000000001','player','Player'), ('00000000-0000-4000-8000-000000000002','referee','Referee');`,
  );
}, 30000);
afterAll(async () => {
  await db.close();
});
describe("Postgres migration, seed and security", () => {
  it("seeds 112 questions and can replay the seed without duplication", async () => {
    await db.exec(readFileSync("supabase/seed.sql", "utf8"));
    expect(
      (
        await db.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM public.question_bank",
        )
      ).rows[0].count,
    ).toBe(112);
  });
  it("enforces one player and one referee", async () => {
    await expect(
      db.exec(
        `INSERT INTO public.profiles VALUES ('00000000-0000-4000-8000-000000000003','player','Third')`,
      ),
    ).rejects.toThrow();
  });
  it("atomically accepts only one writer at a revision", async () => {
    const initial = { version: 1, marker: "initial" };
    const init = await db.query<{ commit_game: boolean }>(
      "SELECT public.commit_game(-1, $1::jsonb)",
      [JSON.stringify(initial)],
    );
    expect(init.rows[0].commit_game).toBe(true);
    const results = await Promise.all(
      ["a", "b"].map((marker) =>
        db.query<{ commit_game: boolean }>(
          "SELECT public.commit_game(0,$1::jsonb)",
          [JSON.stringify({ version: 1, marker })],
        ),
      ),
    );
    expect(results.map((r) => r.rows[0].commit_game).sort()).toEqual([
      false,
      true,
    ]);
    expect(
      (
        await db.query<{ revision: number }>(
          "SELECT revision::int FROM public.game_state",
        )
      ).rows[0].revision,
    ).toBe(1);
  });
  it("rejects state access, role escalation, and RPC from an authenticated browser", async () => {
    await db.exec(
      `SET ROLE authenticated; SET "request.jwt.claim.sub" = '00000000-0000-4000-8000-000000000001';`,
    );
    try {
      const own = await db.query<{ role: string }>(
        "SELECT role FROM public.profiles",
      );
      expect(own.rows).toEqual([{ role: "player" }]);
      await expect(
        db.query("SELECT * FROM public.game_state"),
      ).rejects.toThrow();
      await expect(
        db.query("SELECT * FROM public.question_bank"),
      ).rejects.toThrow();
      await expect(
        db.query(
          "UPDATE public.profiles SET role='referee' WHERE id=auth.uid()",
        ),
      ).rejects.toThrow();
      await expect(
        db.query(`SELECT public.commit_game(1,'{"version":1}'::jsonb)`),
      ).rejects.toThrow();
    } finally {
      await db.exec("RESET ROLE");
    }
  });
  it("denies anonymous access", async () => {
    await db.exec("SET ROLE anon");
    try {
      await expect(db.query("SELECT * FROM public.profiles")).rejects.toThrow();
      await expect(
        db.query("SELECT * FROM public.game_state"),
      ).rejects.toThrow();
    } finally {
      await db.exec("RESET ROLE");
    }
  });
});
describe("SQL reference answers", () => {
  beforeAll(async () => {
    await db.exec(`CREATE TABLE accounts(account_id INTEGER PRIMARY KEY, signup_date DATE, region TEXT);
    CREATE TABLE sessions(session_id INTEGER PRIMARY KEY, account_id INTEGER, started_at TIMESTAMPTZ, converted BOOLEAN);
    CREATE TABLE orders(order_id INTEGER PRIMARY KEY, account_id INTEGER, ordered_at TIMESTAMPTZ, amount NUMERIC, status TEXT);
    CREATE TABLE contacts(contact_id INTEGER PRIMARY KEY, account_id INTEGER, contacted_at TIMESTAMPTZ, channel TEXT);
    INSERT INTO accounts VALUES (1,'2026-08-01','US'),(2,'2026-08-01','US'),(3,'2026-08-02','EU'),(4,'2026-08-03','EU');
    INSERT INTO orders VALUES (1,1,'2026-08-01 03:00Z',100,'paid'),(2,1,'2026-08-01 05:00Z',50,'paid'),(3,1,'2026-08-01 05:00Z',NULL,'paid'),(4,1,'2026-08-02 06:00Z',999,'cancelled'),(5,2,'2026-08-02 06:00Z',40,'paid'),(6,4,'2026-08-03 06:00Z',NULL,'paid');
    INSERT INTO sessions VALUES (1,1,'2026-08-01 05:00Z',true),(2,1,'2026-08-01 06:00Z',NULL),(3,1,'2026-08-02 05:00Z',false),(4,1,'2026-08-03 05:00Z',true),(5,3,'2026-08-02 05:00Z',false);
    INSERT INTO contacts VALUES (1,1,'2026-08-01 03:00Z','email'),(2,1,'2026-08-01 04:00Z','linkedin'),(3,2,'2026-08-01 03:00Z','email');`);
  });
  it.each(data.filter((q) => q.category === "SQL"))(
    "$id executes in PostgreSQL",
    async (q) => {
      const result = await db.query(q.expectedQuery!);
      expect(result.rows).toBeInstanceOf(Array);
    },
  );
  const query = (id: string) => data.find((q) => q.id === id)!.expectedQuery!;
  it("left join preserves zero-order accounts and excludes canceled revenue", async () => {
    const rows = (
      await db.query<{ account_id: number; revenue: string }>(query("sql-01"))
    ).rows;
    expect(rows.find((r) => r.account_id === 3)?.revenue).toBe("0");
    expect(rows.find((r) => r.account_id === 1)?.revenue).toBe("150");
  });
  it("daily aggregation uses New York boundaries and accounts for null conversions", async () => {
    const rows = (
      await db.query<{ day: string; rate: string }>(query("sql-03"))
    ).rows;
    expect(
      Number(
        rows.find(
          (r) => new Date(r.day).toISOString().slice(0, 10) === "2026-08-01",
        )?.rate,
      ),
    ).toBe(0.5);
  });
  it("latest-order ties use descending order_id", async () => {
    const rows = (
      await db.query<{ account_id: number; order_id: number }>(query("sql-05"))
    ).rows;
    expect(rows.find((r) => r.account_id === 1)?.order_id).toBe(3);
  });
  it("null amounts count as zero while synthetic left-join rows do not count", async () => {
    const rows = (
      await db.query<{ region: string; aov: string }>(query("sql-11"))
    ).rows;
    expect(Number(rows.find((r) => r.region === "US")?.aov)).toBe(47.5);
    expect(Number(rows.find((r) => r.region === "EU")?.aov)).toBe(0);
  });
  it("fact-table preaggregation avoids multiplying revenue and session counts", async () => {
    const rows = (
      await db.query<{
        region: string;
        accounts: number;
        sessions: string;
        revenue: string;
      }>(query("sql-19"))
    ).rows;
    const us = rows.find((r) => r.region === "US")!;
    expect(Number(us.accounts)).toBe(2);
    expect(Number(us.sessions)).toBe(4);
    expect(Number(us.revenue)).toBe(190);
  });
});

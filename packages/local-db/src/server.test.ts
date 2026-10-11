import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serveLocalPostgres, type LocalPostgresServer } from "./server";

describe("serveLocalPostgres", () => {
  let db: PGlite;
  let server: LocalPostgresServer;
  let url: string;

  beforeAll(async () => {
    db = await PGlite.create();
    server = await serveLocalPostgres(db, { port: 0 });
    url = `postgresql://postgres:postgres@127.0.0.1:${server.port}/postgres`;
  });

  afterAll(async () => {
    await server.close();
    await db.close();
  });

  it("answers queries from several clients at once", async () => {
    // Prepared statements off, as packages/db configures postgres.js.
    const clients = [1, 2, 3].map(() => postgres(url, { max: 4, prepare: false }));
    try {
      // Statements with and without parameters, so one client's statement can never stand in
      // for another's.
      const results = await Promise.all(
        Array.from({ length: 60 }, (_, i) =>
          i % 2
            ? clients[i % 3]!`select ${i}::int as n, ${`value ${i}`}::text as label`
            : clients[i % 3]!`select 0 as n, 'constant' as label`,
        ),
      );
      results.forEach(([row], i) =>
        expect(row).toEqual(i % 2 ? { n: i, label: `value ${i}` } : { n: 0, label: "constant" }),
      );
    } finally {
      await Promise.all(clients.map((client) => client.end()));
    }
  });

  it("keeps other clients out of an open transaction", async () => {
    const a = postgres(url, { max: 4, prepare: false });
    const b = postgres(url, { max: 4, prepare: false });
    try {
      await a`create table entries (source text not null)`;
      const work: Promise<unknown>[] = [];
      for (let i = 0; i < 12; i++) {
        work.push(
          a
            .begin(async (sql) => {
              await sql`insert into entries values ('transaction')`;
              await sql`select pg_sleep(0.005)`;
              if (i % 3 === 0) throw new Error("roll back");
            })
            .catch(() => undefined),
        );
        work.push(b`insert into entries values ('outside')`);
      }
      await Promise.all(work);

      const rows = await a<{ source: string; count: number }[]>`
        select source, count(*)::int as count from entries group by source order by source`;
      // Rolled-back transactions take only their own inserts with them.
      expect(rows).toEqual([
        { source: "outside", count: 12 },
        { source: "transaction", count: 8 },
      ]);
    } finally {
      await a.end();
      await b.end();
    }
  });

  it("rolls back a transaction left open by a client that disconnects", async () => {
    const a = postgres(url, { max: 1, prepare: false });
    await a`create table drafts (id int)`;
    const reserved = await a.reserve();
    await reserved`begin`;
    await reserved`insert into drafts values (1)`;
    await a.end({ timeout: 0 });

    const b = postgres(url, { max: 1, prepare: false });
    try {
      expect(await b`select count(*)::int as count from drafts`).toEqual([{ count: 0 }]);
    } finally {
      await b.end();
    }
  });
});

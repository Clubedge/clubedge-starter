import { createServer, type Server, type Socket } from "node:net";
import type { PGlite } from "@electric-sql/pglite";

// Request codes sent instead of a startup message (PostgreSQL protocol, "Message Formats").
const SSL_REQUEST = 80877103;
const GSSENC_REQUEST = 80877104;
const CANCEL_REQUEST = 80877102;
// Messages that send a request off: Sync, simple Query, Flush, Terminate, CopyDone, CopyFail.
const REQUEST_END = new Set(["S", "Q", "H", "X", "c", "f"].map((type) => type.charCodeAt(0)));
const FLUSH = "H".charCodeAt(0);

export interface LocalPostgresServer {
  port: number;
  close(): Promise<void>;
}

/**
 * Serves a PGlite database over the PostgreSQL protocol so ordinary clients (postgres.js, Drizzle
 * Kit, psql) can share it. PGlite has a single session, so clients take turns: a client keeps the
 * session from its first message until its Sync or simple Query, including across Flush (clients
 * such as postgres.js describe a statement, then bind it), and for as long as its transaction is
 * open. Other clients wait meanwhile.
 */
export async function serveLocalPostgres(
  db: PGlite,
  { host = "127.0.0.1", port = 5433 }: { host?: string; port?: number } = {},
): Promise<LocalPostgresServer> {
  await db.waitReady;

  // The connection that may use the session, and the connections waiting for it.
  let owner: Socket | null = null;
  const waiting: Array<() => void> = [];

  async function acquire(socket: Socket) {
    while (owner && owner !== socket) await new Promise<void>((wake) => waiting.push(wake));
    owner = socket;
  }

  function release(socket: Socket) {
    if (owner !== socket) return;
    owner = null;
    for (const wake of waiting.splice(0)) wake();
  }

  async function run(socket: Socket, messages: Uint8Array[]) {
    await acquire(socket);
    try {
      for (const message of messages) {
        await db.execProtocolRawStream(message, {
          onRawData: (data) => {
            if (socket.writable) socket.write(data);
          },
        });
      }
    } finally {
      // After a Flush the client continues the same request, so it keeps the session.
      const flushed = messages.at(-1)?.[0] === FLUSH;
      if (!flushed && !db.isInTransaction()) release(socket);
    }
  }

  async function disconnect(socket: Socket) {
    if (owner !== socket) return;
    if (db.isInTransaction()) await db.exec("ROLLBACK");
    release(socket);
  }

  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.setNoDelay(true);
    let buffer = Buffer.alloc(0);
    let started = false;
    let request: Uint8Array[] = [];
    // Requests from one connection run in order.
    let queue = Promise.resolve();

    function enqueue(messages: Uint8Array[]) {
      queue = queue.then(() => run(socket, messages)).catch(() => void socket.destroy());
    }

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (true) {
        if (!started) {
          // Startup-phase messages have no type byte: a length, then a protocol or request code.
          if (buffer.length < 8) return;
          const length = buffer.readInt32BE(0);
          if (buffer.length < length) return;
          const code = buffer.readInt32BE(4);
          const message = buffer.subarray(0, length);
          buffer = buffer.subarray(length);
          if (code === SSL_REQUEST || code === GSSENC_REQUEST) {
            socket.write("N"); // Encryption is not supported; the client continues in plain text.
          } else if (code === CANCEL_REQUEST) {
            socket.end(); // Cancellation is not supported.
            return;
          } else {
            started = true;
            enqueue([new Uint8Array(message)]);
          }
          continue;
        }
        if (buffer.length < 5) return;
        const length = 1 + buffer.readInt32BE(1);
        if (buffer.length < length) return;
        const type = buffer[0]!;
        request.push(new Uint8Array(buffer.subarray(0, length)));
        buffer = buffer.subarray(length);
        if (REQUEST_END.has(type)) {
          enqueue(request);
          request = [];
        }
        if (type === "X".charCodeAt(0)) {
          queue = queue.then(() => void socket.end());
          return;
        }
      }
    });

    socket.on("error", () => socket.destroy());
    socket.on("close", () => {
      sockets.delete(socket);
      queue = queue.then(() => disconnect(socket)).catch(() => undefined);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });
  const address = server.address();

  return {
    port: typeof address === "object" && address ? address.port : port,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

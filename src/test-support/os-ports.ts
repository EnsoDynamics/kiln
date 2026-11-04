// Ports for tests come from the operating system, never a fixed number, so two tests running
// at once can't collide (AC-CI-01 of Kiln public release readiness). A server a test starts in
// its own process listens on port 0 and the test reads the port it bound:
//
//   const server = await serveViewFixture({ port: 0, folder: "customer-returns", snapshot });
//   const port = boundPort(server.address);   // 52714
//
// Where something else must be told a port before it listens, such as the `kiln` command's
// `KILN_PORT_RANGE` or a child process, reserve one first:
//
//   const port = await reservePort();           // 52731
//   const range = await reservePortRange();     // "52732-52732"
//
// Reserve one port per listener, never a run of neighbours: macOS hands out ports in sequence,
// so the port after a reserved one is the next one any other test or connection gets.
import { createServer } from "node:net";

/** The port in a served address such as `http://127.0.0.1:52714/customer-returns`. */
export function boundPort(address: string): number {
  return Number(new URL(address).port);
}

/** A loopback port the operating system has just assigned, released for the caller to listen on. */
export function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen({ port: 0, host: "127.0.0.1", exclusive: true }, () => {
      const { port } = server.address() as import("node:net").AddressInfo;
      server.close(() => resolve(port));
    });
  });
}

/** One reserved port as a `KILN_PORT_RANGE` value, `<port>-<port>`. */
export async function reservePortRange(): Promise<string> {
  const port = await reservePort();
  return `${port}-${port}`;
}

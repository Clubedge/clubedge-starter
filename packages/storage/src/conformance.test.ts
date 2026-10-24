import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describeStorage } from "./conformance";
import { createFileSystemStorage } from "./file-system";

// The local folder adapter proves the suite itself in every environment: no service needed, and
// it opts out of signed URLs, which only mean something when a server can serve them.
describeStorage("file-system", async () => {
  const directory = await mkdtemp(join(tmpdir(), "clubedge-storage-"));
  return {
    storage: () => createFileSystemStorage({ directory }),
    signedUrls: false,
    dispose: () => rm(directory, { recursive: true, force: true }),
  };
});

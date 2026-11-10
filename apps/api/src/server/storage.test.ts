import { describe, expect, it, vi } from "vitest";
import { getStorage } from "./storage";

// A stand-in for the provider the composition root makes, so the test sees what it is handed.
const provider = vi.hoisted(() => ({
  download: vi.fn(async () => new Blob(["456"]).stream()),
}));

// clubedge:if storage=s3
vi.mock("@clubedge/storage-s3", () => ({ createS3Storage: () => provider }));
// clubedge:end
// clubedge:if storage=s3 && infra=local
// The local folder that stands in for S3 while STORAGE_DIRECTORY is set.
vi.mock("@clubedge/storage/file-system", () => ({ createFileSystemStorage: () => provider }));
// clubedge:end
// clubedge:if storage=supabase
vi.mock("@clubedge/storage-supabase", () => ({ createSupabaseStorage: () => provider }));
// clubedge:end

describe("storage composition root", () => {
  it("hands a download's range to the provider", async () => {
    const storage = getStorage(new Request("http://localhost:3001/api/files/1"));
    const range = { start: 4, end: 6 };

    const part = await storage.download("media/clip.mp4", { range });

    expect(await new Response(part).text()).toBe("456");
    expect(provider.download).toHaveBeenCalledWith("media/clip.mp4", { range });
  });
});

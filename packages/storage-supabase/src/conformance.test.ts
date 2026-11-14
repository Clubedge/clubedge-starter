import { createClient } from "@supabase/supabase-js";
import { describeStorage } from "@clubedge/storage/conformance";
import { createSupabaseStorage } from "./index";

// Against a real Supabase Storage: the local stack (`supabase start`), as the Starter's CI runs
// it with these variables set. The service key creates the bucket and passes its policies.
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
const bucket = process.env.SUPABASE_STORAGE_BUCKET || "app";

let ensuring: Promise<void> | undefined;
/** Creates the bucket once, so a fresh stack needs no manual setup. */
function ensureBucket() {
  ensuring ??= (async () => {
    const admin = createClient(url!, key!, { auth: { persistSession: false } });
    const { error } = await admin.storage.createBucket(bucket);
    // A stack that already has the bucket (or refuses to create it) still works for the tests.
    if (error && !/already exists|duplicate/i.test(error.message)) throw error;
  })();
  return ensuring;
}

describeStorage(
  "supabase",
  () => ({
    storage: async () => {
      await ensureBucket();
      const supabase = createClient(url!, key!, { auth: { persistSession: false } });
      return createSupabaseStorage({ bucket, getClient: () => supabase });
    },
  }),
  {
    skip: !(url && key) && "SUPABASE_URL and SUPABASE_SECRET_KEY are not set",
    timeoutMs: 60_000,
  },
);

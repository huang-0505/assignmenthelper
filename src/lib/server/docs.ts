import "server-only";
import { adminClient } from "./supabase";

// Job descriptions are long, so they live in their own private bucket instead of the game state,
// which every page load carries. Only the server's service role can read it.
const BUCKET = "job-docs";
const path = (logId: string) => `jd/${logId}.txt`;

let bucket: Promise<void> | null = null;
function ensureBucket() {
  bucket ??= (async () => {
    const storage = adminClient().storage;
    if (!(await storage.getBucket(BUCKET)).error) return;
    const { error } = await storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: "200KB",
      allowedMimeTypes: ["text/plain"],
    });
    if (error && !/exist/i.test(error.message))
      throw new Error("无法创建职位描述存储空间");
  })().catch((error) => {
    bucket = null;
    throw error;
  });
  return bucket;
}

export async function putJd(logId: string, text: string) {
  await ensureBucket();
  const { error } = await adminClient()
    .storage.from(BUCKET)
    .upload(path(logId), new TextEncoder().encode(text), {
      contentType: "text/plain",
      upsert: true,
    });
  if (error) throw new Error("职位描述保存失败，请重试");
}
export async function getJd(logId: string) {
  await ensureBucket();
  const { data } = await adminClient()
    .storage.from(BUCKET)
    .download(path(logId));
  return data ? await data.text() : null;
}
/** Removing a description that was never saved is a no-op, so deleting a log can always call this. */
export async function removeJd(logId: string) {
  await ensureBucket();
  await adminClient()
    .storage.from(BUCKET)
    .remove([path(logId)]);
}

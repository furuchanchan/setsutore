import { HttpError } from "./errors";

/** drafts/<uuid> の画像を <prefix>/<uuid> へ写す（R2 に copy が無いので get → put）。消すのは呼び出し側が保存後に行う */
export async function promoteDraft(bucket: R2Bucket, draftKey: string, prefix: "receipts" | "meals"): Promise<string> {
  const draft = await bucket.get(draftKey);
  if (!draft) throw new HttpError(400, "image_key の下書き画像が見つかりません（撮り直してください）");
  const finalKey = `${prefix}/${draftKey.slice("drafts/".length)}`;
  await bucket.put(finalKey, draft.body, { httpMetadata: draft.httpMetadata });
  return finalKey;
}

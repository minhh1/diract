// app/api/profile/avatar/route.ts
// Self-service avatar upload for the signed-in user. Stores the image in the
// public `avatars` bucket at {userId}/{uuid}.{ext} and points profiles.avatar_url
// at it, removing any previous avatar file for that user. See
// supabase/profiles_avatar_url.sql for the bucket setup note.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { randomUUID } from "crypto";

const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

async function getUser() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let form: FormData;
  try { form = await req.formData(); } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "A photo file is required" }, { status: 400 });

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Photo must be a PNG, JPEG, WEBP, or GIF" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Photo must be under 5MB" }, { status: 400 });

  const admin = adminClient();
  const { data: prof } = await admin.from("profiles").select("avatar_url").eq("id", user.id).single();

  const bytes = Buffer.from(await file.arrayBuffer());
  const storagePath = `${user.id}/${randomUUID()}.${ext}`;

  const { error: uploadErr } = await admin.storage.from("avatars").upload(storagePath, bytes, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadErr) return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 });

  const { data: pub } = admin.storage.from("avatars").getPublicUrl(storagePath);

  const { error: updateErr } = await admin.from("profiles").update({ avatar_url: pub.publicUrl }).eq("id", user.id);
  if (updateErr) {
    await admin.storage.from("avatars").remove([storagePath]);
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  const previousPath = extractStoragePath(prof?.avatar_url);
  if (previousPath) await admin.storage.from("avatars").remove([previousPath]);

  return NextResponse.json({ ok: true, avatar_url: pub.publicUrl });
}

export async function DELETE() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = adminClient();
  const { data: prof } = await admin.from("profiles").select("avatar_url").eq("id", user.id).single();

  const { error: updateErr } = await admin.from("profiles").update({ avatar_url: null }).eq("id", user.id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  const previousPath = extractStoragePath(prof?.avatar_url);
  if (previousPath) await admin.storage.from("avatars").remove([previousPath]);

  return NextResponse.json({ ok: true });
}

function extractStoragePath(avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl) return null;
  const marker = "/avatars/";
  const idx = avatarUrl.indexOf(marker);
  return idx === -1 ? null : avatarUrl.slice(idx + marker.length);
}

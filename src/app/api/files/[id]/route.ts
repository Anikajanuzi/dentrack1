import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { asUser } from "@/lib/db";

// Streams a case file. Access is decided by Row Level Security for the signed-in user.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [file] = await asUser(user.id, (tx) =>
    tx<{ file_name: string; mime_type: string | null; content: Buffer }[]>`
      select file_name, mime_type, content from case_attachments where id = ${id}`,
  );
  if (!file?.content) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(file.content), {
    headers: {
      "Content-Type": file.mime_type || "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.file_name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

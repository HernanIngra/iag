import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const fileId = req.nextUrl.searchParams.get("fileId");
  const type = req.nextUrl.searchParams.get("type") ?? "file";

  if (!fileId) {
    return NextResponse.json({ error: "Missing fileId" }, { status: 400 });
  }

  const url =
    type === "sheets"
      ? `https://docs.google.com/spreadsheets/d/${fileId}/export?format=xlsx`
      : `https://drive.google.com/uc?export=download&id=${fileId}`;

  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Google devolvió ${res.status} — verificá que el archivo sea público` },
        { status: res.status }
      );
    }
    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": 'attachment; filename="drive-manejo.xlsx"',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

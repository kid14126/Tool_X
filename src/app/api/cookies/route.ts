import {
  clearCookies,
  cookiesStatus,
  saveCookiesText,
} from "@/lib/cookies";
import { jsonWithCors, optionsCors } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(req: Request) {
  return optionsCors(req);
}

export async function GET(req: Request) {
  const st = cookiesStatus();
  return jsonWithCors(
    {
      present: st.present,
      size: st.size,
      updatedAt: st.updatedAt,
    },
    { req },
  );
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") || "";

    let text = "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!file || !(file instanceof File)) {
        return jsonWithCors(
          { error: "Thiếu file cookies (field name: file)" },
          { status: 400, req },
        );
      }
      text = await file.text();
    } else if (contentType.includes("application/json")) {
      const body = (await req.json()) as { text?: string };
      text = body.text || "";
    } else {
      text = await req.text();
    }

    saveCookiesText(text);
    const st = cookiesStatus();
    return jsonWithCors(
      {
        ok: true,
        present: st.present,
        size: st.size,
        updatedAt: st.updatedAt,
        message: "Đã lưu cookies.txt — thử Phân tích lại link TikTok/IG/FB.",
      },
      { req },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lưu cookies thất bại";
    return jsonWithCors({ error: message }, { status: 400, req });
  }
}

export async function DELETE(req: Request) {
  clearCookies();
  return jsonWithCors({ ok: true, present: false }, { req });
}

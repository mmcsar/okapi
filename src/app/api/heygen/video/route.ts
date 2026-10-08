import { resolveLlmAccess } from "@/lib/llm-access";
import {
  checkAndConsumeQuota,
  quotaExceededResponse,
  quotaKeyFromRequest,
} from "@/lib/llm-quota";
import {
  getHeygenSession,
  getHeygenVideo,
  heygenConfigured,
  isSafeHeygenId,
  startHeygenVideo,
} from "@/lib/heygen";
import { assertBodySize, sanitizePublicError } from "@/lib/security";
import { getUserFromAuthHeader } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 30;

type Body = { prompt?: string };

function fail(message: string, status = 500) {
  return Response.json(
    { error: sanitizePublicError(message) },
    { status },
  );
}

/** Démarre une vidéo à partir d’un brief (« crée une vidéo… »). */
export async function POST(request: Request) {
  const tooBig = assertBodySize(request, 20_000);
  if (tooBig) return tooBig;

  const session = await getUserFromAuthHeader(request);
  if (!session) {
    return fail("Connexion requise pour créer une vidéo.", 401);
  }

  const access = await resolveLlmAccess(request);
  const quota = checkAndConsumeQuota(quotaKeyFromRequest(request), "generate", {
    paid: access.paid,
  });
  if (!quota.ok) return quotaExceededResponse(quota);

  if (!heygenConfigured()) {
    return fail("Service vidéo Okapi non configuré — contacte l’admin MMC.", 503);
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  const prompt = body?.prompt?.trim() || "";
  if (prompt.length < 3) {
    return fail("Décris la vidéo à créer (min. 3 caractères).", 400);
  }

  try {
    const started = await startHeygenVideo(prompt);
    return Response.json({
      ok: true,
      sessionId: started.sessionId,
      videoId: started.videoId,
      status: started.status,
      progress: started.progress,
      videoUrl: started.videoUrl,
      prompt,
    });
  } catch (err) {
    return fail(
      err instanceof Error ? err.message : "Impossible de lancer la vidéo.",
      502,
    );
  }
}

/** Une passe de suivi : session, puis URL dès que le rendu est prêt. */
export async function GET(request: Request) {
  const sessionUser = await getUserFromAuthHeader(request);
  if (!sessionUser) {
    return fail("Connexion requise pour suivre une vidéo.", 401);
  }

  if (!heygenConfigured()) {
    return fail("Service vidéo Okapi non configuré — contacte l’admin MMC.", 503);
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId")?.trim() || "";
  const videoIdParam = searchParams.get("videoId")?.trim() || "";
  if (!isSafeHeygenId(sessionId) && !isSafeHeygenId(videoIdParam)) {
    return fail("Suivi vidéo invalide.", 400);
  }

  try {
    let videoId = isSafeHeygenId(videoIdParam) ? videoIdParam : null;
    let status = "thinking";
    let progress: number | null = null;
    let error: string | null = null;

    if (isSafeHeygenId(sessionId)) {
      const session = await getHeygenSession(sessionId);
      status = session.status;
      progress = session.progress;
      error = session.error;
      videoId = session.videoId || videoId;
      if (session.videoUrl) {
        return Response.json({
          ok: true,
          sessionId,
          videoId,
          status: "completed",
          progress: 100,
          videoUrl: session.videoUrl,
        });
      }
      if (status === "failed") {
        return fail(error || "La vidéo n’a pas pu être générée.", 502);
      }
      if (status === "waiting_for_input" || status === "reviewing") {
        return fail(
          "Le brief est trop vague pour une vidéo. Précise le sujet, la durée et le ton.",
          422,
        );
      }
    }

    if (videoId && isSafeHeygenId(videoId)) {
      const video = await getHeygenVideo(videoId);
      if (video.status === "failed") {
        return fail(video.error || "La vidéo n’a pas pu être générée.", 502);
      }
      if (video.videoUrl) {
        return Response.json({
          ok: true,
          sessionId: sessionId || null,
          videoId,
          status: "completed",
          progress: 100,
          videoUrl: video.videoUrl,
        });
      }
      status = video.status || status;
    }

    return Response.json({
      ok: true,
      sessionId: sessionId || null,
      videoId,
      status,
      progress,
      videoUrl: null,
    });
  } catch (err) {
    return fail(
      err instanceof Error ? err.message : "Suivi vidéo impossible.",
      502,
    );
  }
}

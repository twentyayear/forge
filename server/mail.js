// server/mail.js — magic-link email delivery via Resend.
//
// Third-party client pins its origin before sending credentials (Sam's rule):
// the Resend API URL is hardcoded, never taken from env/config.
//
// In NODE_ENV=test, no network call is made — the {email, url} pair is pushed
// onto `outbox` instead, which is how tests capture the magic-link URL.
const RESEND_API_URL = "https://api.resend.com/emails";

export const outbox = [];

function renderHtml(url) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#000000;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#000000;padding:40px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:8px 0 24px;text-align:center;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.08em;">
                WORKHART
              </td>
            </tr>
            <tr>
              <td style="padding:8px 0 24px;text-align:center;">
                <a href="${url}" style="display:inline-block;background:#29ABE2;color:#000000;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:6px;font-size:16px;">
                  Sign in to WORKHART
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 24px;text-align:center;color:#8a8a8a;font-size:13px;">
                Or paste this link into your browser:<br />
                <a href="${url}" style="color:#29ABE2;word-break:break-all;">${url}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px 8px;text-align:center;color:#666666;font-size:12px;">
                This link expires in 15 minutes.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderText(url) {
  return `Sign in to WORKHART: ${url}\n\nThis link expires in 15 minutes.`;
}

// sendMagicLink(email, url) -> { ok: boolean }
// On Resend failure, logs status + Resend error message (never the API key)
// and returns { ok: false }; callers must still respond generically to the
// client (no oracle on delivery success/failure).
export async function sendMagicLink(email, url) {
  if (process.env.NODE_ENV === "test") {
    outbox.push({ email, url });
    return { ok: true };
  }

  const from = process.env.MAIL_FROM || "WORKHART <onboarding@resend.dev>";

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "Sign in to WORKHART",
        html: renderHtml(url),
        text: renderText(url),
      }),
    });

    if (!res.ok) {
      let detail = "";
      try {
        const body = await res.json();
        detail = body && body.message ? body.message : JSON.stringify(body);
      } catch {
        detail = await res.text().catch(() => "");
      }
      console.error(`resend send failed: status=${res.status} message=${detail}`);
      return { ok: false };
    }

    const body = await res.json().catch(() => ({}));
    console.log(`resend send attempt ok: message_id=${body && body.id ? body.id : "unknown"}`);
    return { ok: true };
  } catch (err) {
    console.error(`resend send error: ${err.message}`);
    return { ok: false };
  }
}

// THE SUBJECT IS "Kyle: " PLUS THE FIRST 48 CHARACTERS OF THE BODY, COLLAPSED TO ONE LINE; EXPORTED SO TESTS CAN ASSERT THE RULE.
export function kyleSubject(body) {
  return "Kyle: " + String(body).replace(/\s+/g, " ").trim().slice(0, 48);
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderKyleHtml(body, appUrl) {
  const paragraphs = body
    .trim()
    .split(/\n\s*\n/)
    .map((p) => `<p style="margin:0 0 16px;color:#ffffff;font-size:16px;line-height:1.5;">${escapeHtml(p.trim()).replace(/\n/g, "<br />")}</p>`)
    .join("\n");
  const url = escapeHtml(appUrl);
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#000000;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#000000;padding:40px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding:8px 0 24px;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.08em;">
                Kyle
              </td>
            </tr>
            <tr>
              <td style="padding:0 0 16px;">
                ${paragraphs}
              </td>
            </tr>
            <tr>
              <td style="padding:8px 0 24px;">
                <a href="${url}" style="display:inline-block;background:#29ABE2;color:#000000;font-weight:700;text-decoration:none;padding:14px 28px;border-radius:6px;font-size:16px;">
                  Open WORKHART
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 0 8px;color:#8a8a8a;font-size:12px;">
                You get these because a message from Kyle waited in WORKHART. Turn them off in Settings.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

// SENDKYLEMESSAGE(EMAIL, { BODY, APPURL }) RETURNS { OK, ID }.
// SAME PINNED RESEND URL AND FROM-ADDRESS AS SENDMAGICLINK; NEVER LOGS THE BODY, ONLY STATUS AND RESEND'S MESSAGE ON FAILURE.
export async function sendKyleMessage(email, { body, appUrl }) {
  if (process.env.NODE_ENV === "test") {
    outbox.push({ email, kind: "message", body, appUrl });
    return { ok: true, id: "test" };
  }

  const from = process.env.MAIL_FROM || "WORKHART <onboarding@resend.dev>";

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: kyleSubject(body),
        html: renderKyleHtml(body, appUrl),
        text: `${body}\n\nOpen WORKHART: ${appUrl}`,
      }),
    });

    if (!res.ok) {
      let detail = "";
      try {
        const errBody = await res.json();
        detail = errBody && errBody.message ? errBody.message : JSON.stringify(errBody);
      } catch {
        detail = await res.text().catch(() => "");
      }
      console.error(`resend send failed: status=${res.status} message=${detail}`);
      return { ok: false, id: null };
    }

    const okBody = await res.json().catch(() => ({}));
    return { ok: true, id: okBody && okBody.id ? okBody.id : null };
  } catch (err) {
    console.error(`resend send error: ${err.message}`);
    return { ok: false, id: null };
  }
}

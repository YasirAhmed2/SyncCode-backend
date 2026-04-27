import SibApiV3Sdk from "sib-api-v3-sdk";

const client = SibApiV3Sdk.ApiClient.instance;
client.authentications["api-key"].apiKey = process.env.BREVO_API_KEY!;

const emailApi = new SibApiV3Sdk.TransactionalEmailsApi();

type OtpEmailPurpose = "email-verification" | "password-reset";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");

const formatDisplayName = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const buildEmailLayout = ({
  preheader,
  title,
  subtitle,
  body,
  footerNote,
}: {
  preheader: string;
  title: string;
  subtitle: string;
  body: string;
  footerNote: string;
}) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#edf2f8;font-family:'Segoe UI','Helvetica Neue',Tahoma,Arial,sans-serif;color:#0f172a;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#edf2f8;padding:30px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:680px;background:#ffffff;border:1px solid #cfd9e8;border-radius:10px;overflow:hidden;box-shadow:0 18px 36px rgba(15,23,42,0.11);">
          <tr>
            <td align="center" style="background:#0f2747;background-image:linear-gradient(135deg,#0f2747 0%,#17477f 62%,#2a6bb0 100%);padding:34px 24px 36px 24px;border-bottom:4px solid #0a1d36;">
              <div style="font-size:42px;line-height:1.05;color:#ffffff;font-weight:700;letter-spacing:0.03em;text-align:center;font-family:'Segoe UI','Helvetica Neue',Arial,sans-serif;">SyncCode</div>
            </td>
          </tr>
          <tr>
            <td style="padding:34px 34px 28px 34px;">
              <h1 style="margin:0;font-size:30px;line-height:1.25;color:#0f172a;font-weight:800;letter-spacing:-0.01em;">${title}</h1>
              <p style="margin:12px 0 0 0;font-size:15px;line-height:1.82;color:#2f415e;">${subtitle}</p>
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding:0 34px 30px 34px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid #d6e0ef;padding-top:20px;">
                <tr>
                  <td style="font-size:12px;line-height:1.8;color:#5f6f88;">
                    ${footerNote}<br />
                    This is an automated email from SyncCode. Please do not reply directly.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

const buildOtpEmailHtml = ({
  otp,
  purpose,
}: {
  otp: string;
  purpose: OtpEmailPurpose;
}) => {
  const isVerification = purpose === "email-verification";
  const title = isVerification ? "Verify your email" : "Reset your password";
  const subtitle = isVerification
    ? "Use the one-time code below to activate your SyncCode account and complete setup."
    : "Use the one-time code below to continue your secure password reset process.";
  const footerNote = isVerification
    ? "If you did not create this account, you can safely ignore this message."
    : "If you did not request a password reset, secure your account immediately.";

  const body = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:24px;">
      <tr>
        <td align="center" style="background:#f4f8ff;border:1px solid #bad0f3;border-left:5px solid #0055cc;border-radius:8px;padding:24px;">
          <div style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#0055cc;font-weight:800;">One-Time Passcode</div>
          <div style="margin-top:11px;font-size:40px;letter-spacing:0.34em;color:#0b3d91;font-weight:800;font-family:'Consolas','SFMono-Regular',Menlo,'Liberation Mono',monospace;">${otp}</div>
        </td>
      </tr>
    </table>
    <p style="margin:18px 0 0 0;font-size:14px;line-height:1.8;color:#2f415e;">
      This code expires in <strong>5 minutes</strong>.
      For your security, never share this code with anyone.
    </p>
  `;

  return buildEmailLayout({
    preheader: `${title} code: ${otp}`,
    title,
    subtitle,
    body,
    footerNote,
  });
};

const buildWelcomeEmailHtml = ({ userName }: { userName: string }) => {
  const formattedName = formatDisplayName(userName || "there");
  const safeName = escapeHtml(formattedName || "There");

  const body = `
    <p style="margin:24px 0 0 0;font-size:15px;line-height:1.85;color:#2f415e;">
      Hi <strong>${safeName}</strong>,<br />
      thank you for completing your registration. Your account is now fully verified and ready for real-time development collaboration in SyncCode.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:22px;background:#f6f9ff;border:1px solid #cad8ee;border-left:5px solid #0055cc;border-radius:8px;">
      <tr>
        <td style="padding:18px 20px;">
          <div style="font-size:14px;line-height:1.7;color:#0f172a;font-weight:800;text-transform:uppercase;letter-spacing:0.06em;">What you can do next</div>
          <div style="font-size:14px;line-height:1.8;color:#2f415e;margin-top:8px;">1. Create your first room and invite teammates.</div>
          <div style="font-size:14px;line-height:1.8;color:#2f415e;">2. Start coding with built-in execution support.</div>
          <div style="font-size:14px;line-height:1.8;color:#2f415e;">3. Share recordings and review session outcomes.</div>
        </td>
      </tr>
    </table>
    <p style="margin:18px 0 0 0;font-size:14px;line-height:1.8;color:#2f415e;">
      We are excited to have you onboard.<br />
      <strong>Welcome to SyncCode.</strong>
    </p>
  `;

  return buildEmailLayout({
    preheader: "Welcome to SyncCode - your account is verified.",
    title: "Your SyncCode account is ready",
    subtitle:
      "Welcome aboard. We built SyncCode to help teams ship faster through seamless collaboration.",
    body,
    footerNote: "Need help? Reach out to our support team anytime.",
  });
};

export const sendEmail = async (
  to: string,
  subject: string,
  html: string,
  text?: string
) => {
  try {
    await emailApi.sendTransacEmail({
      sender: {
        email: "yasirahmed9921@gmail.com",
        name: "SyncCode Support",
      },
      to: [{ email: to }],
      subject,
      ...(text ? { textContent: text } : {}),
      htmlContent: html,
    });
  } catch (error: any) {
    console.error("Brevo API email failed:", error?.response?.body || error);
    throw new Error("Email could not be sent");
  }
};

export const sendOtpEmail = async (
  to: string,
  otp: string,
  purpose: OtpEmailPurpose
) => {
  const subject =
    purpose === "email-verification"
      ? "Verify Your SyncCode Account"
      : "SyncCode Password Reset OTP";

  const html = buildOtpEmailHtml({ otp, purpose });
  const text =
    purpose === "email-verification"
      ? `Verify your SyncCode account\n\nYour verification code is: ${otp}\n\nThis code expires in 5 minutes.`
      : `SyncCode password reset\n\nYour reset code is: ${otp}\n\nThis code expires in 5 minutes.`;

  await sendEmail(to, subject, html, text);
};

export const sendWelcomeEmail = async (to: string, userName: string) => {
  const html = buildWelcomeEmailHtml({ userName });
  const formattedName = formatDisplayName(userName || "there") || "There";
  const text = [
    `Hi ${formattedName},`,
    "",
    "Thank you for completing your registration. Your SyncCode account is now fully verified.",
    "",
    "What you can do next:",
    "1. Create your first room and invite teammates.",
    "2. Start coding with built-in execution support.",
    "3. Share recordings and review session outcomes.",
    "",
    "Welcome to SyncCode.",
  ].join("\n");

  await sendEmail(to, "Welcome to SyncCode", html, text);
};

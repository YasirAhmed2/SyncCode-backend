import SibApiV3Sdk from "sib-api-v3-sdk";

const client = SibApiV3Sdk.ApiClient.instance;
client.authentications["api-key"].apiKey = process.env.BREVO_API_KEY!;

const emailApi = new SibApiV3Sdk.TransactionalEmailsApi();

export const sendEmail = async (
  to: string,
  subject: string,
  html: string
) => {
  try {
    await emailApi.sendTransacEmail({
      sender: {
        email: "yasirahmed9921@gmail.com",
        name: "SyncCode Support",
      },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    });
  } catch (error: any) {
    console.error("Brevo API email failed:", error?.response?.body || error);
    throw new Error("Email could not be sent");
  }
};

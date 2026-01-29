import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.BREVO_SMTP_USER,
    pass: process.env.BREVO_SMTP_PASS,
  },
});

export const sendEmail = async (
  to: string,
  subject: string,
  html: string
) => {
  try {
    await transporter.sendMail({
      from: `"SyncCode Support" <yasirahmed9921@gmail.com>`,
      to,
      subject,
      html,
    });
  } catch (error: any) {
    console.error("Email sending failed:", error);
    throw new Error("Email could not be sent");
  }
};

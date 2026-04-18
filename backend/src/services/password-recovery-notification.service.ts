import nodemailer from "nodemailer";
import { env } from "../config/env";

type PasswordResetNotificationInput = {
  email: string;
  name: string;
  token: string;
};

export class PasswordRecoveryNotificationService {
  async sendPasswordResetNotification(input: PasswordResetNotificationInput): Promise<void> {
    const resetLink = `${env.APP_BASE_URL}/reset-password?token=${input.token}`;
    const hasSmtpConfiguration = Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS && env.SMTP_FROM);

    if (env.NODE_ENV === "development" || (!hasSmtpConfiguration && env.PASSWORD_RECOVERY_DEBUG)) {
      console.log("[PASSWORD_RECOVERY]", {
        email: input.email,
        token: input.token,
        resetLink
      });

      return;
    }

    const transporter = hasSmtpConfiguration
      ? nodemailer.createTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_PORT === 465,
          auth: {
            user: env.SMTP_USER,
            pass: env.SMTP_PASS
          }
        })
      : nodemailer.createTransport({
          jsonTransport: true
        });

    if (!hasSmtpConfiguration) {
      console.warn("[PASSWORD_RECOVERY] SMTP not configured. Using jsonTransport fallback.");
    }

    await transporter.sendMail({
      from: env.SMTP_FROM ?? "no-reply@local",
      to: input.email,
      subject: "Recuperação de senha",
      text: `Olá ${input.name}, use este link para redefinir sua senha: ${resetLink}`,
      html: `
        <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
          <h2>Recuperação de senha</h2>
          <p>Olá ${input.name},</p>
          <p>Recebemos uma solicitação de recuperação de senha.</p>
          <p>
            <a href="${resetLink}" style="display:inline-block;padding:10px 14px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;">
              Redefinir senha
            </a>
          </p>
          <p>Se não foi você, ignore este email.</p>
        </div>
      `
    });
  }
}

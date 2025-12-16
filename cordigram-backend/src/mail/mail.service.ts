import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import { ConfigService } from '../config/config.service';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.smtpHost,
      port: this.config.smtpPort,
      secure: this.config.smtpSecure,
      auth: {
        user: this.config.smtpUser,
        pass: this.config.smtpPass,
      },
    });
  }

  async sendOtpEmail(
    email: string,
    code: string,
    expiresMinutes: number,
  ): Promise<void> {
    const subject = 'Mã đăng nhập Cordigram';
    const text = `Mã của bạn: ${code}\nHiệu lực: ${expiresMinutes} phút.`;
    // Dùng URL công khai để tránh xuất hiện file đính kèm. Đặt FRONTEND_URL trỏ tới nơi có logo.png
    const logoUrl = `${this.config.frontendUrl.replace(/\/$/, '')}/logo.png`;
    const html = `
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f6f9fc;padding:32px 0;font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;">
        <tr>
          <td align="center">
            <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border-radius:18px;box-shadow:0 12px 40px rgba(15,23,42,0.08);padding:32px 36px;">
              <tr>
                <td align="center" style="padding-bottom:20px;">
                  <img src="${logoUrl}" alt="Cordigram" height="46" style="display:block;">
                </td>
              </tr>
              <tr>
                <td style="font-size:22px;font-weight:700;padding-bottom:10px;color:#0f172a;">Mã xác thực đăng ký</td>
              </tr>
              <tr>
                <td style="font-size:15px;line-height:1.6;padding-bottom:16px;color:#475569;">
                  Chào bạn, dưới đây là mã xác thực để tiếp tục đăng ký Cordigram. Mã chỉ có hiệu lực trong ${expiresMinutes} phút.
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:12px 0 18px;">
                  <div style="display:inline-block;padding:14px 28px;border-radius:14px;background:#0ea5e9;color:#ffffff;font-size:20px;font-weight:800;letter-spacing:4px;">
                    ${code}
                  </div>
                </td>
              </tr>
              <tr>
                <td style="font-size:14px;line-height:1.6;color:#475569;padding-bottom:6px;">
                  Nếu bạn không yêu cầu mã này, bạn có thể bỏ qua email.
                </td>
              </tr>
              <tr>
                <td style="font-size:13px;line-height:1.5;color:#94a3b8;">— Đội ngũ Cordigram</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`;
    try {
      await this.transporter.sendMail({
        from: this.config.mailFrom,
        to: email,
        subject,
        text,
        html,
      });
    } catch (err) {
      this.logger.error(`Failed to send OTP email to ${email}`, err as Error);
      throw err;
    }
  }
}

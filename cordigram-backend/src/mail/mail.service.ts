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

  private formatReasonLabel(reason?: string | null): string {
    if (!reason?.trim()) {
      return 'Violation of community rules';
    }

    return reason
      .trim()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  private escapeHtml(input?: string | null): string {
    return (input ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private formatCurrency(amount: number, currency?: string | null): string {
    const normalized = (currency ?? 'vnd').toUpperCase();
    const safeAmount = Number.isFinite(amount) ? amount : 0;
    return new Intl.NumberFormat('vi-VN', {
      style: 'currency',
      currency: normalized,
      maximumFractionDigits: 0,
    }).format(safeAmount);
  }

  async sendAdsPaymentSuccessEmail(params: {
    email: string;
    campaignName?: string | null;
    actionType?: string | null;
    sessionId: string;
    paymentIntentId?: string | null;
    paidAt?: Date | null;
    amountTotal: number;
    currency?: string | null;
    objective?: string | null;
    adFormat?: string | null;
    placement?: string | null;
    boostPackageId?: string | null;
    durationPackageId?: string | null;
    durationDays?: number | null;
    targetLocation?: string | null;
    targetAgeMin?: number | null;
    targetAgeMax?: number | null;
    ctaLabel?: string | null;
    destinationUrl?: string | null;
    interests?: string[];
    mediaCount?: number;
    targetCampaignId?: string | null;
  }): Promise<void> {
    const campaignName = params.campaignName?.trim() || 'Cordigram Ads Campaign';
    const paidAtText = params.paidAt
      ? new Intl.DateTimeFormat('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(params.paidAt)
      : 'Confirmed';
    const amountText = this.formatCurrency(params.amountTotal, params.currency);
    const ageRange =
      Number.isFinite(params.targetAgeMin) && Number.isFinite(params.targetAgeMax)
        ? `${params.targetAgeMin} - ${params.targetAgeMax}`
        : 'No limit';
    const interests = (params.interests ?? []).map((v) => v.trim()).filter(Boolean);

    const boostCatalog: Record<string, { label: string; price: number }> = {
      light: { label: 'Light Boost', price: 79000 },
      standard: { label: 'Standard Boost', price: 149000 },
      strong: { label: 'Strong Boost', price: 299000 },
    };

    const durationCatalog: Record<string, { label: string; price: number }> = {
      none: { label: 'No extension', price: 0 },
      d3: { label: '3 days', price: 29000 },
      d7: { label: '7 days', price: 59000 },
      d14: { label: '14 days', price: 99000 },
      d30: { label: '30 days', price: 179000 },
    };

    const boostInfo = boostCatalog[params.boostPackageId ?? ''];
    const durationInfo = durationCatalog[params.durationPackageId ?? ''];

    const boostPackageSummary = boostInfo
      ? `${boostInfo.label} (${this.formatCurrency(boostInfo.price, params.currency)})`
      : params.boostPackageId?.trim() || 'N/A';

    const durationLabelFromDays = Number.isFinite(params.durationDays)
      ? `${params.durationDays} days`
      : 'N/A';
    const durationPackageSummary = durationInfo
      ? `${durationInfo.label} (${this.formatCurrency(durationInfo.price, params.currency)})`
      : params.durationPackageId?.trim()
        ? `${params.durationPackageId.trim()} (${durationLabelFromDays})`
        : 'N/A';

    const subject = `Cordigram Ads - Payment Successful: ${campaignName}`;
    const text = [
      'Your ad campaign has been created successfully on Cordigram.',
      `Campaign: ${campaignName}`,
      `Total paid: ${amountText}`,
      `Paid at: ${paidAtText}`,
      `Boost package: ${boostPackageSummary}`,
      `Duration package: ${durationPackageSummary}`,
      params.paymentIntentId ? `Payment Intent: ${params.paymentIntentId}` : null,
      '',
      'Invoice details:',
      `- Objective: ${params.objective || 'N/A'}`,
      `- Ad format: ${params.adFormat || 'N/A'}`,
      `- Target location: ${params.targetLocation || 'N/A'}`,
      `- Target age: ${ageRange}`,
      `- CTA: ${params.ctaLabel || 'N/A'}`,
      `- Destination URL: ${params.destinationUrl || 'N/A'}`,
      `- Media count: ${params.mediaCount ?? 0}`,
      interests.length ? `- Interests: ${interests.join(', ')}` : null,
      params.targetCampaignId ? `- Upgraded campaign ID: ${params.targetCampaignId}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const logoUrl =
      'https://res.cloudinary.com/doicocgeo/image/upload/v1765956408/logo_plpbhm.png';

    const row = (label: string, value?: string | null) => {
      if (!value?.trim()) return '';
      return `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;">${this.escapeHtml(label)}</td>
          <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:13px;font-weight:600;text-align:right;">${this.escapeHtml(value)}</td>
        </tr>`;
    };

    const html = `
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f6f9fc;padding:28px 10px;font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;">
        <tr>
          <td align="center">
            <table width="620" cellpadding="0" cellspacing="0" role="presentation" style="max-width:620px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 14px 34px rgba(15,23,42,0.10);">
              <tr>
                <td style="background:linear-gradient(135deg,#0ea5e9,#2563eb);padding:24px 28px;">
                  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                    <tr>
                      <td align="left">
                        <img src="${logoUrl}" alt="Cordigram" height="40" style="display:block;">
                      </td>
                      <td align="right" style="color:#e0f2fe;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Paid Invoice</td>
                    </tr>
                  </table>
                  <div style="margin-top:16px;color:#ffffff;font-size:24px;line-height:1.25;font-weight:800;">Ad Campaign Created Successfully</div>
                  <div style="margin-top:8px;color:#dbeafe;font-size:14px;line-height:1.6;">Your payment has been confirmed and your ad campaign is now active.</div>
                </td>
              </tr>

              <tr>
                <td style="padding:18px 24px 8px;">
                  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border:1px solid #dbeafe;border-radius:14px;background:#f8fbff;padding:14px;">
                    <tr>
                      <td style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.07em;">Total Paid</td>
                      <td style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.07em;text-align:right;">Paid At</td>
                    </tr>
                    <tr>
                      <td style="padding-top:6px;font-size:24px;font-weight:800;color:#0f172a;">${this.escapeHtml(amountText)}</td>
                      <td style="padding-top:6px;font-size:14px;font-weight:600;color:#0f172a;text-align:right;">${this.escapeHtml(paidAtText)}</td>
                    </tr>
                    <tr>
                      <td style="padding-top:12px;font-size:12px;color:#64748b;">Boost package</td>
                      <td style="padding-top:12px;font-size:13px;font-weight:700;color:#0f172a;text-align:right;">${this.escapeHtml(boostPackageSummary)}</td>
                    </tr>
                    <tr>
                      <td style="padding-top:6px;font-size:12px;color:#64748b;">Duration package</td>
                      <td style="padding-top:6px;font-size:13px;font-weight:700;color:#0f172a;text-align:right;">${this.escapeHtml(durationPackageSummary)}</td>
                    </tr>
                  </table>
                </td>
              </tr>

              <tr>
                <td style="padding:8px 24px 20px;">
                  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;">
                    ${row('Campaign', campaignName)}
                    ${row('Payment Intent', params.paymentIntentId ?? '')}
                    ${row('Objective', params.objective ?? 'N/A')}
                    ${row('Ad format', params.adFormat ?? 'N/A')}
                    ${row('Target location', params.targetLocation ?? 'N/A')}
                    ${row('Target age', ageRange)}
                    ${row('CTA', params.ctaLabel ?? 'N/A')}
                    ${row('Destination URL', params.destinationUrl ?? 'N/A')}
                    ${row('Media count', String(params.mediaCount ?? 0))}
                    ${row('Interests', interests.length ? interests.join(', ') : 'N/A')}
                    ${row('Target campaign ID', params.targetCampaignId ?? '')}
                  </table>
                </td>
              </tr>

              <tr>
                <td style="padding:0 24px 24px;color:#64748b;font-size:13px;line-height:1.6;">
                  If you did not make this payment, please contact Cordigram support immediately at cordigram@gmail.com.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`;

    try {
      await this.transporter.sendMail({
        from: this.config.mailFrom,
        to: params.email,
        subject,
        text,
        html,
      });
    } catch (err) {
      this.logger.error(
        `Failed to send ads payment success email to ${params.email}`,
        err as Error,
      );
      throw err;
    }
  }

  async sendOtpEmail(
    email: string,
    code: string,
    expiresMinutes: number,
  ): Promise<void> {
    const subject = 'Mã đăng nhập Cordigram';
    const text = `Mã của bạn: ${code}\nHiệu lực: ${expiresMinutes} phút.`;

    const logoUrl =
      'https://res.cloudinary.com/doicocgeo/image/upload/v1765956408/logo_plpbhm.png';
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

  async sendPasswordResetEmail(
    email: string,
    code: string,
    expiresMinutes: number,
  ): Promise<void> {
    const subject = 'Đặt lại mật khẩu Cordigram';
    const text = `Mã đặt lại mật khẩu của bạn: ${code}\nHiệu lực: ${expiresMinutes} phút.`;

    const logoUrl =
      'https://res.cloudinary.com/doicocgeo/image/upload/v1765956408/logo_plpbhm.png';
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
                <td style="font-size:22px;font-weight:700;padding-bottom:10px;color:#0f172a;">Mã đặt lại mật khẩu</td>
              </tr>
              <tr>
                <td style="font-size:15px;line-height:1.6;padding-bottom:16px;color:#475569;">
                  Đây là mã đặt lại mật khẩu của bạn. Mã có hiệu lực trong ${expiresMinutes} phút.
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
                <td style="font-size:13px;line-height:1.5;color:#94a3b8;">Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.</td>
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
      this.logger.error(
        `Failed to send password reset email to ${email}`,
        err as Error,
      );
      throw err;
    }
  }

  async sendChangeEmailOtp(
    email: string,
    code: string,
    expiresMinutes: number,
  ): Promise<void> {
    const subject = 'Xác nhận đổi email Cordigram';
    const text = `Mã xác nhận đổi email: ${code}\nHiệu lực: ${expiresMinutes} phút.`;

    const logoUrl =
      'https://res.cloudinary.com/doicocgeo/image/upload/v1765956408/logo_plpbhm.png';
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
                <td style="font-size:22px;font-weight:700;padding-bottom:10px;color:#0f172a;">Xác nhận đổi email</td>
              </tr>
              <tr>
                <td style="font-size:15px;line-height:1.6;padding-bottom:16px;color:#475569;">
                  Bạn vừa yêu cầu đổi địa chỉ email cho tài khoản Cordigram. Mã xác nhận có hiệu lực trong ${expiresMinutes} phút.
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:12px 0 18px;">
                  <div style="display:inline-block;padding:14px 28px;border-radius:14px;background:#2563eb;color:#ffffff;font-size:20px;font-weight:800;letter-spacing:4px;">
                    ${code}
                  </div>
                </td>
              </tr>
              <tr>
                <td style="font-size:14px;line-height:1.6;color:#475569;padding-bottom:6px;">
                  Nếu bạn không yêu cầu đổi email, hãy bỏ qua email này.
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
      this.logger.error(
        `Failed to send change email OTP to ${email}`,
        err as Error,
      );
      throw err;
    }
  }

  async sendChangePasswordOtp(
    email: string,
    code: string,
    expiresMinutes: number,
  ): Promise<void> {
    const subject = 'Confirm your Cordigram password change';
    const text = `Your password change code: ${code}\nValid for ${expiresMinutes} minutes.`;

    const logoUrl =
      'https://res.cloudinary.com/doicocgeo/image/upload/v1765956408/logo_plpbhm.png';
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
                <td style="font-size:22px;font-weight:700;padding-bottom:10px;color:#0f172a;">Confirm password change</td>
              </tr>
              <tr>
                <td style="font-size:15px;line-height:1.6;padding-bottom:16px;color:#475569;">
                  We received a request to change your Cordigram password. Use the code below to continue. The code expires in ${expiresMinutes} minutes.
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:12px 0 18px;">
                  <div style="display:inline-block;padding:14px 28px;border-radius:14px;background:#2563eb;color:#ffffff;font-size:20px;font-weight:800;letter-spacing:4px;">
                    ${code}
                  </div>
                </td>
              </tr>
              <tr>
                <td style="font-size:14px;line-height:1.6;color:#475569;padding-bottom:6px;">
                  If you did not request this change, you can safely ignore this email.
                </td>
              </tr>
              <tr>
                <td style="font-size:13px;line-height:1.5;color:#94a3b8;">— Cordigram Team</td>
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
      this.logger.error(
        `Failed to send change password OTP to ${email}`,
        err as Error,
      );
      throw err;
    }
  }

  async sendPasskeyOtp(
    email: string,
    code: string,
    expiresMinutes: number,
  ): Promise<void> {
    const subject = 'Confirm your Cordigram passkey setup';
    const text = `Your passkey setup code: ${code}\nValid for ${expiresMinutes} minutes.`;

    const logoUrl =
      'https://res.cloudinary.com/doicocgeo/image/upload/v1765956408/logo_plpbhm.png';
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
                <td style="font-size:22px;font-weight:700;padding-bottom:10px;color:#0f172a;">Confirm passkey setup</td>
              </tr>
              <tr>
                <td style="font-size:15px;line-height:1.6;padding-bottom:16px;color:#475569;">
                  We received a request to set up or change your Cordigram passkey. Use the code below to continue. The code expires in ${expiresMinutes} minutes.
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:12px 0 18px;">
                  <div style="display:inline-block;padding:14px 28px;border-radius:14px;background:#2563eb;color:#ffffff;font-size:20px;font-weight:800;letter-spacing:4px;">
                    ${code}
                  </div>
                </td>
              </tr>
              <tr>
                <td style="font-size:14px;line-height:1.6;color:#475569;padding-bottom:6px;">
                  If you did not request this change, you can safely ignore this email.
                </td>
              </tr>
              <tr>
                <td style="font-size:13px;line-height:1.5;color:#94a3b8;">— Cordigram Team</td>
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
      this.logger.error(`Failed to send passkey OTP to ${email}`, err as Error);
      throw err;
    }
  }

  async sendTwoFactorOtp(
    email: string,
    code: string,
    expiresMinutes: number,
  ): Promise<void> {
    const subject = 'Confirm your Cordigram login';
    const text = `Your login code: ${code}\nValid for ${expiresMinutes} minutes.`;

    const logoUrl =
      'https://res.cloudinary.com/doicocgeo/image/upload/v1765956408/logo_plpbhm.png';
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
                <td style="font-size:22px;font-weight:700;padding-bottom:10px;color:#0f172a;">Two-factor verification</td>
              </tr>
              <tr>
                <td style="font-size:15px;line-height:1.6;padding-bottom:16px;color:#475569;">
                  Enter this code to finish signing in to Cordigram. The code expires in ${expiresMinutes} minutes.
                </td>
              </tr>
              <tr>
                <td align="center" style="padding:12px 0 18px;">
                  <div style="display:inline-block;padding:14px 28px;border-radius:14px;background:#2563eb;color:#ffffff;font-size:20px;font-weight:800;letter-spacing:4px;">
                    ${code}
                  </div>
                </td>
              </tr>
              <tr>
                <td style="font-size:14px;line-height:1.6;color:#475569;padding-bottom:6px;">
                  If you did not request this login, you can safely ignore this email.
                </td>
              </tr>
              <tr>
                <td style="font-size:13px;line-height:1.5;color:#94a3b8;">— Cordigram Team</td>
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
      this.logger.error(
        `Failed to send two-factor OTP to ${email}`,
        err as Error,
      );
      throw err;
    }
  }

  async sendAccountBannedEmail(params: {
    email: string;
    reason?: string | null;
    moderatorNote?: string | null;
  }): Promise<void> {
    const { email, reason, moderatorNote } = params;
    const subject = 'Cordigram account suspended';
    const normalizedReason = this.formatReasonLabel(reason);
    const normalizedNote = moderatorNote?.trim() || null;
    const supportEmail = 'cordigram@gmail.com';
    const text = [
      'Your Cordigram account has been suspended.',
      `Reason: ${normalizedReason}`,
      normalizedNote ? `Moderator note: ${normalizedNote}` : null,
      '',
      `If you think this is a mistake, contact us at ${supportEmail}.`,
    ]
      .filter(Boolean)
      .join('\n');

    const logoUrl =
      'https://res.cloudinary.com/doicocgeo/image/upload/v1765956408/logo_plpbhm.png';
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
                <td style="font-size:22px;font-weight:700;padding-bottom:10px;color:#0f172a;">Account suspended</td>
              </tr>
              <tr>
                <td style="font-size:15px;line-height:1.6;padding-bottom:10px;color:#475569;">
                  Your Cordigram account has been suspended after a moderation review.
                </td>
              </tr>
              <tr>
                <td style="font-size:14px;line-height:1.6;padding:10px 14px;border-radius:12px;background:#f8fafc;color:#334155;margin-bottom:10px;">
                  <strong>Reason:</strong> ${normalizedReason}
                </td>
              </tr>
              ${
                normalizedNote
                  ? `<tr><td style="font-size:14px;line-height:1.6;color:#475569;padding-top:10px;"><strong>Moderator note:</strong> ${normalizedNote}</td></tr>`
                  : ''
              }
              <tr>
                <td style="font-size:14px;line-height:1.6;color:#475569;padding-top:16px;">
                  If you believe this is an error, please contact us at
                  <a href="mailto:${supportEmail}" style="color:#2563eb;text-decoration:none;">${supportEmail}</a>.
                </td>
              </tr>
              <tr>
                <td style="font-size:13px;line-height:1.5;color:#94a3b8;padding-top:16px;">— Cordigram Team</td>
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
      this.logger.error(
        `Failed to send account banned email to ${email}`,
        err as Error,
      );
      throw err;
    }
  }
}

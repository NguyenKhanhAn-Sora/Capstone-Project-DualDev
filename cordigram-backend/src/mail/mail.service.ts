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

  async sendCreatorVerificationApprovedEmail(params: {
    email: string;
    displayName?: string | null;
  }): Promise<void> {
    const greeting = params.displayName?.trim() || 'Creator';
    const subject = 'Cordigram creator verification approved';
    const text = [
      `Hello ${greeting},`,
      '',
      'Your creator verification request has been approved.',
      'Your account now has the blue check creator badge and creator privileges.',
      '',
      'Thanks for contributing quality content to Cordigram.',
    ].join('\n');

    const html = `
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f6f9fc;padding:28px 10px;font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;">
        <tr>
          <td align="center">
            <table width="620" cellpadding="0" cellspacing="0" role="presentation" style="max-width:620px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 14px 34px rgba(15,23,42,0.10);">
              <tr>
                <td style="background:linear-gradient(135deg,#0ea5e9,#2563eb);padding:26px 28px;">
                  <div style="font-size:24px;line-height:1.3;font-weight:800;color:#ffffff;">Creator verification approved</div>
                  <div style="margin-top:8px;font-size:14px;color:#dbeafe;line-height:1.6;">You now have the blue check creator badge on Cordigram.</div>
                </td>
              </tr>
              <tr>
                <td style="padding:22px 26px 26px;">
                  <p style="margin:0 0 10px;color:#0f172a;font-size:15px;">Hello ${this.escapeHtml(greeting)},</p>
                  <p style="margin:0 0 12px;color:#334155;font-size:14px;line-height:1.7;">Your creator verification request has been approved. You can now access creator-level privileges and selected benefits.</p>
                  <p style="margin:0;color:#334155;font-size:14px;line-height:1.7;">Thank you for building a high-quality community experience.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`;

    await this.transporter.sendMail({
      from: this.config.mailFrom,
      to: params.email,
      subject,
      text,
      html,
    });
  }

  async sendCreatorVerificationRejectedEmail(params: {
    email: string;
    reason?: string | null;
    cooldownUntil?: Date | null;
  }): Promise<void> {
    const reason =
      params.reason?.trim() ||
      'Your account does not currently meet the creator verification requirements.';
    const nextDate = params.cooldownUntil
      ? new Intl.DateTimeFormat('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(params.cooldownUntil)
      : null;

    const subject = 'Cordigram creator verification update';
    const text = [
      'Your creator verification request was not approved this time.',
      `Reason: ${reason}`,
      nextDate ? `You can submit a new request after: ${nextDate}` : null,
      '',
      'Please keep building consistent, high-quality engagement and try again.',
    ]
      .filter(Boolean)
      .join('\n');

    const html = `
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f6f9fc;padding:28px 10px;font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;">
        <tr>
          <td align="center">
            <table width="620" cellpadding="0" cellspacing="0" role="presentation" style="max-width:620px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 14px 34px rgba(15,23,42,0.10);">
              <tr>
                <td style="background:linear-gradient(135deg,#f59e0b,#ea580c);padding:26px 28px;">
                  <div style="font-size:24px;line-height:1.3;font-weight:800;color:#ffffff;">Creator verification update</div>
                  <div style="margin-top:8px;font-size:14px;color:#ffedd5;line-height:1.6;">This request was not approved yet.</div>
                </td>
              </tr>
              <tr>
                <td style="padding:22px 26px 26px;">
                  <p style="margin:0 0 10px;color:#334155;font-size:14px;line-height:1.7;">Reason: ${this.escapeHtml(reason)}</p>
                  ${nextDate ? `<p style="margin:0;color:#334155;font-size:14px;line-height:1.7;">You can submit a new request after <strong>${this.escapeHtml(nextDate)}</strong>.</p>` : ''}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`;

    await this.transporter.sendMail({
      from: this.config.mailFrom,
      to: params.email,
      subject,
      text,
      html,
    });
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
    const campaignName =
      params.campaignName?.trim() || 'Cordigram Ads Campaign';
    const paidAtText = params.paidAt
      ? new Intl.DateTimeFormat('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(params.paidAt)
      : 'Confirmed';
    const amountText = this.formatCurrency(params.amountTotal, params.currency);
    const ageRange =
      Number.isFinite(params.targetAgeMin) &&
      Number.isFinite(params.targetAgeMax)
        ? `${params.targetAgeMin} - ${params.targetAgeMax}`
        : 'No limit';
    const interests = (params.interests ?? [])
      .map((v) => v.trim())
      .filter(Boolean);

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
      params.paymentIntentId
        ? `Payment Intent: ${params.paymentIntentId}`
        : null,
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
      params.targetCampaignId
        ? `- Upgraded campaign ID: ${params.targetCampaignId}`
        : null,
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

  async sendAdsCampaignCanceledByAdminEmail(params: {
    email: string;
    displayName?: string | null;
    campaignName?: string | null;
    reason: string;
  }): Promise<void> {
    const greeting = params.displayName?.trim() || 'Advertiser';
    const campaignName = params.campaignName?.trim() || 'your ads campaign';
    const reason = params.reason.trim();

    const subject = 'Cordigram Ads campaign canceled by admin';
    const text = [
      `Hello ${greeting},`,
      '',
      `Your campaign "${campaignName}" has been canceled by our admin team and is no longer delivering.`,
      '',
      `Reason from admin: ${reason}`,
      '',
      'No strike has been added to your account for this action.',
      'If you believe this is a mistake, please contact cordigram@gmail.com.',
      '',
      'Cordigram Trust & Safety Team',
    ].join('\n');

    const html = `
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f6f9fc;padding:28px 10px;font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;">
        <tr>
          <td align="center">
            <table width="620" cellpadding="0" cellspacing="0" role="presentation" style="max-width:620px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 14px 34px rgba(15,23,42,0.10);">
              <tr>
                <td style="background:linear-gradient(135deg,#ef4444,#b91c1c);padding:24px 28px;">
                  <div style="font-size:23px;line-height:1.3;font-weight:800;color:#ffffff;">Ads campaign canceled by admin</div>
                  <div style="margin-top:8px;font-size:14px;color:#fee2e2;line-height:1.6;">Your campaign is no longer delivering.</div>
                </td>
              </tr>
              <tr>
                <td style="padding:22px 26px 24px;">
                  <p style="margin:0 0 10px;color:#0f172a;font-size:15px;">Hello ${this.escapeHtml(greeting)},</p>
                  <p style="margin:0 0 10px;color:#334155;font-size:14px;line-height:1.7;">Your campaign <strong>${this.escapeHtml(campaignName)}</strong> has been canceled by our admin team and is no longer delivering.</p>
                  <div style="margin:12px 0;padding:12px 14px;border-radius:12px;border:1px solid #fecaca;background:#fef2f2;color:#7f1d1d;font-size:13px;line-height:1.6;">
                    <strong>Reason from admin:</strong><br />
                    ${this.escapeHtml(reason)}
                  </div>
                  <p style="margin:0 0 8px;color:#334155;font-size:14px;line-height:1.7;">No strike has been added to your account for this action.</p>
                  <p style="margin:0;color:#334155;font-size:14px;line-height:1.7;">If you believe this is a mistake, please contact <strong>cordigram@gmail.com</strong>.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`;

    await this.transporter.sendMail({
      from: this.config.mailFrom,
      to: params.email,
      subject,
      text,
      html,
    });
  }

  async sendAdsCampaignReopenedByAdminEmail(params: {
    email: string;
    displayName?: string | null;
    campaignName?: string | null;
  }): Promise<void> {
    const greeting = params.displayName?.trim() || 'Advertiser';
    const campaignName = params.campaignName?.trim() || 'your ads campaign';

    const subject = 'Cordigram Ads campaign reopened by admin';
    const text = [
      `Hello ${greeting},`,
      '',
      `Good news. Your campaign "${campaignName}" has been reopened by our admin team and can deliver again.`,
      '',
      'No strike has been added to your account for this action.',
      'You can review campaign status in your Ads dashboard.',
      '',
      'Cordigram Trust & Safety Team',
    ].join('\n');

    const html = `
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f6f9fc;padding:28px 10px;font-family:'Segoe UI',Arial,sans-serif;color:#1f2937;">
        <tr>
          <td align="center">
            <table width="620" cellpadding="0" cellspacing="0" role="presentation" style="max-width:620px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 14px 34px rgba(15,23,42,0.10);">
              <tr>
                <td style="background:linear-gradient(135deg,#16a34a,#15803d);padding:24px 28px;">
                  <div style="font-size:23px;line-height:1.3;font-weight:800;color:#ffffff;">Ads campaign reopened by admin</div>
                  <div style="margin-top:8px;font-size:14px;color:#dcfce7;line-height:1.6;">Your campaign can deliver again.</div>
                </td>
              </tr>
              <tr>
                <td style="padding:22px 26px 24px;">
                  <p style="margin:0 0 10px;color:#0f172a;font-size:15px;">Hello ${this.escapeHtml(greeting)},</p>
                  <p style="margin:0 0 10px;color:#334155;font-size:14px;line-height:1.7;">Good news. Your campaign <strong>${this.escapeHtml(campaignName)}</strong> has been reopened by our admin team and can deliver again.</p>
                  <p style="margin:0 0 8px;color:#334155;font-size:14px;line-height:1.7;">No strike has been added to your account for this action.</p>
                  <p style="margin:0;color:#334155;font-size:14px;line-height:1.7;">You can review campaign status in your Ads dashboard.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`;

    await this.transporter.sendMail({
      from: this.config.mailFrom,
      to: params.email,
      subject,
      text,
      html,
    });
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

  async sendStrikeThresholdPenaltyEmail(params: {
    email: string;
    penaltyType: 'reach_restricted' | 'read_only_limited' | 'account_suspended';
    strikeTotal: number;
    threshold: number;
    expiresAt: Date;
  }): Promise<void> {
    const { email, penaltyType, strikeTotal, threshold, expiresAt } = params;
    const formatter = new Intl.DateTimeFormat('vi-VN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    const formattedExpiry = formatter.format(expiresAt);

    const penaltyLabel =
      penaltyType === 'reach_restricted'
        ? 'Reach restricted for your posts'
        : penaltyType === 'read_only_limited'
          ? 'Read-only restriction enabled'
          : 'Account suspended';

    const penaltyDetail =
      penaltyType === 'reach_restricted'
        ? 'Your post distribution is temporarily reduced. Your content may appear less in feeds and discovery surfaces.'
        : penaltyType === 'read_only_limited'
          ? 'Your account is temporarily set to read-only mode. You can view content, but cannot interact or create new content/ads.'
          : 'Your account is temporarily suspended. You will need to wait until the suspension expires before using the account again.';

    const subject = `Cordigram moderation update: ${penaltyLabel}`;
    const text = [
      `A strike-threshold moderation policy has been applied to your account.`,
      `Penalty: ${penaltyLabel}`,
      `Current strike total: ${strikeTotal}`,
      `Triggered threshold: ${threshold}`,
      `Effective until: ${formattedExpiry}`,
      '',
      penaltyDetail,
      '',
      'If you believe this was applied in error, please contact support at cordigram@gmail.com.',
    ].join('\n');

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
                <td style="font-size:22px;font-weight:700;padding-bottom:10px;color:#0f172a;">Moderation penalty applied</td>
              </tr>
              <tr>
                <td style="font-size:15px;line-height:1.6;padding-bottom:12px;color:#475569;">
                  A strike-threshold moderation policy has been applied to your account.
                </td>
              </tr>
              <tr>
                <td style="font-size:14px;line-height:1.7;padding:12px 14px;border-radius:12px;background:#f8fafc;color:#334155;">
                  <strong>Penalty:</strong> ${penaltyLabel}<br>
                  <strong>Current strike total:</strong> ${strikeTotal}<br>
                  <strong>Triggered threshold:</strong> ${threshold}<br>
                  <strong>Effective until:</strong> ${formattedExpiry}
                </td>
              </tr>
              <tr>
                <td style="font-size:14px;line-height:1.6;color:#475569;padding-top:14px;">
                  ${penaltyDetail}
                </td>
              </tr>
              <tr>
                <td style="font-size:14px;line-height:1.6;color:#475569;padding-top:12px;">
                  If you believe this was applied in error, contact us at
                  <a href="mailto:cordigram@gmail.com" style="color:#2563eb;text-decoration:none;">cordigram@gmail.com</a>.
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
        `Failed to send strike threshold penalty email to ${email}`,
        err as Error,
      );
      throw err;
    }
  }

  async sendStrikeDecayAppliedEmail(params: {
    email: string;
    previousStrike: number;
    nextStrike: number;
    ruleWindowDays: number;
    decayAmount?: number;
    bonusApplied?: boolean;
  }): Promise<void> {
    const {
      email,
      previousStrike,
      nextStrike,
      ruleWindowDays,
      decayAmount = 1,
      bonusApplied = false,
    } = params;
    const subject = 'Cordigram moderation update: strike reduced';
    const text = [
      'Your account maintained a clean behavior streak and your strike score was reduced automatically.',
      `Previous strike total: ${previousStrike}`,
      `Current strike total: ${nextStrike}`,
      `Reduction applied: -${decayAmount} strike${decayAmount > 1 ? 's' : ''}.`,
      bonusApplied
        ? `Rule applied: base clean-window decay + bonus for sustained positive behavior (${ruleWindowDays}-day evaluation window).`
        : `Rule applied: -1 strike after ${ruleWindowDays} clean days (with monthly safety cap).`,
      '',
      'Keep following community guidelines to continue improving your moderation standing.',
    ].join('\n');

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
                <td style="font-size:22px;font-weight:700;padding-bottom:10px;color:#0f172a;">Strike score reduced</td>
              </tr>
              <tr>
                <td style="font-size:15px;line-height:1.6;padding-bottom:12px;color:#475569;">
                  Your account maintained a clean behavior streak, so your strike score was reduced automatically.
                </td>
              </tr>
              <tr>
                <td style="font-size:14px;line-height:1.7;padding:12px 14px;border-radius:12px;background:#f8fafc;color:#334155;">
                  <strong>Previous strike total:</strong> ${previousStrike}<br>
                  <strong>Current strike total:</strong> ${nextStrike}<br>
                  <strong>Reduction applied:</strong> -${decayAmount} strike${decayAmount > 1 ? 's' : ''}<br>
                  <strong>Rule applied:</strong>
                  ${
                    bonusApplied
                      ? `base clean-window decay + bonus for sustained positive behavior (${ruleWindowDays}-day evaluation window).`
                      : `-1 strike after ${ruleWindowDays} clean days (with monthly safety cap).`
                  }
                </td>
              </tr>
              <tr>
                <td style="font-size:14px;line-height:1.6;color:#475569;padding-top:14px;">
                  Keep following community guidelines to continue improving your moderation standing.
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
        `Failed to send strike decay email to ${email}`,
        err as Error,
      );
      throw err;
    }
  }
}

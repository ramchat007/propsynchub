/**
 * PropSyncHub Notification Engine
 * Provider-Neutral Notification Abstraction
 * 
 * Supports transactional emails for:
 * - Email OTP Authentication
 * - Booking Confirmation
 * - Payment Receipts & Invoices
 * - Front Desk Alert
 */

export interface EmailNotificationPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
  metadata?: Record<string, unknown>;
}

export interface BookingConfirmationEmailParams {
  to: string;
  guestName: string;
  bookingReference: string;
  resortName: string;
  categoryName: string;
  roomUnitName?: string;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  adults: number;
  children: number;
  totalAmountInr: number;
  paymentStatus: string;
  guestPortalUrl: string;
  contactPhone?: string;
}

export interface OtpEmailParams {
  to: string;
  otpCode: string;
  expiresInMinutes?: number;
  resortName?: string;
}

class NotificationService {
  /**
   * Dispatches a transactional email
   */
  async sendEmail(payload: EmailNotificationPayload): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      // 1. Console log structured preview in development
      console.log('====================================================');
      console.log(`[TRANSACTIONAL EMAIL DISPATCH] TO: ${payload.to}`);
      console.log(`SUBJECT: ${payload.subject}`);
      console.log('--- PREVIEW ---');
      console.log(payload.text || payload.html.replace(/<[^>]*>?/gm, '').slice(0, 300));
      console.log('====================================================');

      // 2. Extensible provider hook (e.g. Resend / SendGrid / AWS SES)
      const resendApiKey = process.env.RESEND_API_KEY;
      if (resendApiKey) {
        try {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: process.env.SYSTEM_FROM_EMAIL || 'PropSyncHub <onboarding@resend.dev>',
              to: payload.to,
              subject: payload.subject,
              html: payload.html,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            return { success: true, id: data.id };
          }
        } catch (providerErr) {
          console.warn('[Notification Provider Warning]:', providerErr);
        }
      }

      // Default development delivery
      return { success: true, id: `dev_${Date.now()}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send notification email';
      return { success: false, error: msg };
    }
  }

  /**
   * Sends Email OTP verification code
   */
  async sendOtpEmail(params: OtpEmailParams): Promise<{ success: boolean; error?: string }> {
    const { to, otpCode, expiresInMinutes = 10, resortName = 'PropSyncHub' } = params;
    const subject = `Your Verification Code: ${otpCode} — ${resortName}`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px;">
        <div style="margin-bottom: 24px;">
          <h2 style="margin: 0; font-size: 20px; font-weight: 800; color: #111827;">${resortName}</h2>
          <p style="margin: 4px 0 0; font-size: 13px; color: #6b7280;">Secure Guest Authentication</p>
        </div>
        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
          <p style="margin: 0 0 8px; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280;">Your Single-Use Verification Code</p>
          <div style="font-size: 36px; font-weight: 900; letter-spacing: 0.25em; color: #047857; margin: 12px 0;">${otpCode}</div>
          <p style="margin: 0; font-size: 12px; color: #9ca3af;">Valid for ${expiresInMinutes} minutes. Never share this code with anyone.</p>
        </div>
        <p style="font-size: 13px; color: #4b5563; line-height: 1.5; margin: 0;">If you did not request this verification code, please ignore this email.</p>
      </div>
    `;

    return this.sendEmail({
      to,
      subject,
      html,
      text: `Your verification code for ${resortName} is: ${otpCode}. Valid for ${expiresInMinutes} minutes.`,
    });
  }

  /**
   * Sends Booking Confirmation Email
   */
  async sendBookingConfirmationEmail(params: BookingConfirmationEmailParams): Promise<{ success: boolean; error?: string }> {
    const {
      to,
      guestName,
      bookingReference,
      resortName,
      categoryName,
      roomUnitName,
      checkInDate,
      checkOutDate,
      nights,
      adults,
      children,
      totalAmountInr,
      paymentStatus,
      guestPortalUrl,
      contactPhone,
    } = params;

    const subject = `Booking Confirmed #${bookingReference.toUpperCase()} — ${resortName}`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px;">
        <div style="background: #047857; padding: 24px; border-radius: 12px; text-align: center; color: #ffffff; margin-bottom: 24px;">
          <h1 style="margin: 0; font-size: 22px; font-weight: 800;">Reservation Confirmed</h1>
          <p style="margin: 6px 0 0; font-size: 13px; opacity: 0.9;">Ref: #${bookingReference.toUpperCase()} · ${resortName}</p>
        </div>
        
        <p style="font-size: 15px; color: #111827; margin: 0 0 16px;">Dear <strong>${guestName}</strong>,</p>
        <p style="font-size: 13px; color: #4b5563; line-height: 1.6; margin: 0 0 24px;">
          Thank you for choosing <strong>${resortName}</strong>. Your stay reservation is confirmed. Here are the details of your stay:
        </p>

        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 24px; font-size: 13px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Category:</td>
              <td style="padding: 6px 0; font-weight: 700; text-align: right; color: #111827;">${categoryName}</td>
            </tr>
            ${roomUnitName ? `
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Assigned Unit:</td>
              <td style="padding: 6px 0; font-weight: 700; text-align: right; color: #047857;">${roomUnitName}</td>
            </tr>` : ''}
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Check-in:</td>
              <td style="padding: 6px 0; font-weight: 600; text-align: right; color: #111827;">${checkInDate}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Check-out:</td>
              <td style="padding: 6px 0; font-weight: 600; text-align: right; color: #111827;">${checkOutDate} (${nights} ${nights === 1 ? 'night' : 'nights'})</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Guests:</td>
              <td style="padding: 6px 0; font-weight: 600; text-align: right; color: #111827;">${adults} Adults${children > 0 ? `, ${children} Children` : ''}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Payment Status:</td>
              <td style="padding: 6px 0; font-weight: 700; text-align: right; color: ${paymentStatus === 'paid' ? '#047857' : '#d97706'}; text-transform: uppercase;">${paymentStatus}</td>
            </tr>
            <tr style="border-top: 1px solid #e5e7eb;">
              <td style="padding: 12px 0 6px; font-weight: 800; font-size: 14px; color: #111827;">Total Amount:</td>
              <td style="padding: 12px 0 6px; font-weight: 800; font-size: 15px; text-align: right; color: #047857;">₹${totalAmountInr.toLocaleString()}</td>
            </tr>
          </table>
        </div>

        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${guestPortalUrl}" style="display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-size: 13px; font-weight: 700;">
            View Guest Portal &amp; Folio →
          </a>
        </div>

        ${contactPhone ? `<p style="font-size: 12px; color: #6b7280; text-align: center; margin: 0;">Front desk assistance: ${contactPhone}</p>` : ''}
      </div>
    `;

    return this.sendEmail({
      to,
      subject,
      html,
      text: `Your reservation at ${resortName} is confirmed. Ref: #${bookingReference}. Check-in: ${checkInDate}, Check-out: ${checkOutDate}. Total: ₹${totalAmountInr.toLocaleString()}. Guest Portal: ${guestPortalUrl}`,
    });
  }

  /**
   * Sends Team Member / Staff Invitation Email
   */
  async sendTeamInviteEmail(params: TeamInviteEmailParams): Promise<{ success: boolean; error?: string }> {
    const { to, inviteeName, resortName, role, inviterName, loginUrl } = params;
    const roleLabel = role === 'tenant_admin' ? 'Resort Administrator' : 'Front Desk Staff';
    const subject = `Invitation: Join ${resortName} as ${roleLabel} on PropSyncHub`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 580px; margin: 0 auto; padding: 32px 24px; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px;">
        <div style="background: linear-gradient(135deg, #059669 0%, #047857 100%); padding: 28px 24px; border-radius: 14px; text-align: center; color: #ffffff; margin-bottom: 24px;">
          <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.02em;">Team Invitation</h1>
          <p style="margin: 6px 0 0; font-size: 13px; opacity: 0.9;">PropSyncHub Resort Operations</p>
        </div>

        <p style="font-size: 15px; color: #111827; margin: 0 0 14px;">Hi <strong>${inviteeName}</strong>,</p>
        <p style="font-size: 13px; color: #4b5563; line-height: 1.6; margin: 0 0 20px;">
          ${inviterName ? `<strong>${inviterName}</strong> has invited you` : 'You have been invited'} to join the team at <strong>${resortName}</strong> as a <strong>${roleLabel}</strong>.
        </p>

        <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 24px; font-size: 13px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Property:</td>
              <td style="padding: 6px 0; font-weight: 700; text-align: right; color: #111827;">${resortName}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Assigned Role:</td>
              <td style="padding: 6px 0; font-weight: 700; text-align: right; color: #047857;">${roleLabel}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280;">Account Email:</td>
              <td style="padding: 6px 0; font-weight: 600; text-align: right; color: #111827;">${to}</td>
            </tr>
          </table>
        </div>

        <div style="text-align: center; margin-bottom: 24px;">
          <a href="${loginUrl}" style="display: inline-block; background: #047857; color: #ffffff; text-decoration: none; padding: 13px 28px; border-radius: 10px; font-size: 14px; font-weight: 700; box-shadow: 0 2px 4px rgba(4, 120, 87, 0.2);">
            Sign In to Operations Desk &rarr;
          </a>
        </div>

        <p style="font-size: 12px; color: #9ca3af; text-align: center; line-height: 1.5; margin: 0;">
          You can sign in directly using Google One-Tap or by requesting an Email OTP with this email (${to}).
        </p>
      </div>
    `;

    return this.sendEmail({
      to,
      subject,
      html,
      text: `You have been invited to join ${resortName} as a ${roleLabel}. Sign in here: ${loginUrl}`,
    });
  }
}

export interface TeamInviteEmailParams {
  to: string;
  inviteeName: string;
  resortName: string;
  role: 'tenant_admin' | 'staff';
  inviterName?: string;
  loginUrl: string;
}

export const notifications = new NotificationService();


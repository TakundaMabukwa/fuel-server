/**
 * Energy Rite Email Service
 * Handles sending report emails to configured recipients
 */
const notificationapi = require('notificationapi-node-server-sdk').default;
const { supabase } = require('../../supabase-client');

class EnergyRiteEmailService {
  constructor() {
    this.alertRecipientsCache = new Map();
    this.alertRecipientsCacheTtlMs = parseInt(process.env.ALERT_RECIPIENT_CACHE_TTL_MS || '60000', 10);
    this.setupNotificationAPI();
  }

  /**
   * Setup NotificationAPI
   */
  setupNotificationAPI() {
    try {
      notificationapi.init(
        process.env.NOTIFICATIONAPI_CLIENT_ID,
        process.env.NOTIFICATIONAPI_CLIENT_SECRET
      );
      console.log('✅ NotificationAPI initialized');
    } catch (error) {
      console.error('❌ NotificationAPI initialization failed:', error.message);
    }
  }

  /**
   * Get email recipients based on cost code
   */
  async getEmailRecipients(costCode = null) {
    try {
      let query = supabase
        .from('energyrite_emails')
        .select('email, branch')
        .eq('status', 'active');

      if (costCode) {
        query = query.or(`cost_code.is.null,cost_code.eq.${costCode}`);
      }

      const { data, error } = await query.order('email');
      
      if (error) throw new Error(`Database error: ${error.message}`);
      
      return data;
    } catch (error) {
      console.error('Error getting email recipients:', error.message);
      return [];
    }
  }

  normalizeAlertType(alertType) {
    return (alertType || '').toString().trim().toUpperCase();
  }

  normalizeSite(site) {
    return (site || '').toString().trim().toUpperCase();
  }

  getAlertRecipientCacheKey(plate, alertType) {
    return `${this.normalizeSite(plate) || '__ALL_SITES__'}::${this.normalizeAlertType(alertType) || '__ALL_TYPES__'}`;
  }

  /**
   * Get active recipients for realtime alerts by site + alert type.
   * Falls back to energyrite_emails if subscription table does not exist yet.
   */
  async getAlertRecipients(plate = null, alertType = null) {
    const normalizedType = this.normalizeAlertType(alertType);
    const normalizedPlate = this.normalizeSite(plate);
    const cacheKey = this.getAlertRecipientCacheKey(normalizedPlate, normalizedType);

    const cached = this.alertRecipientsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.recipients;
    }

    try {
      // Primary model: per-site, per-alert subscriptions
      let query = supabase
        .from('energyrite_alert_subscriptions')
        .select('email, site, alert_type')
        .eq('status', 'active')
        .eq('channel', 'EMAIL');

      if (normalizedPlate) {
        query = query.in('site', [normalizedPlate, '*']);
      }

      if (normalizedType) {
        query = query.in('alert_type', [normalizedType, 'ALL']);
      }

      const { data, error } = await query.order('email');

      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }

      const filtered = (data || []).filter((row) => {
        const site = this.normalizeSite(row.site);
        const rowType = this.normalizeAlertType(row.alert_type);
        const siteMatches = !normalizedPlate || !site || site === '*' || site === normalizedPlate;
        const typeMatches = !normalizedType || !rowType || rowType === 'ALL' || rowType === normalizedType;
        return siteMatches && typeMatches;
      });

      const dedup = new Map();
      for (const row of filtered) {
        if (row.email) dedup.set(row.email.toLowerCase(), { email: row.email });
      }
      const recipients = Array.from(dedup.values());

      this.alertRecipientsCache.set(cacheKey, {
        recipients,
        expiresAt: Date.now() + this.alertRecipientsCacheTtlMs
      });

      return recipients;
    } catch (error) {
      // Fallback for older deployments: use existing report recipients table
      console.log(`⚠️ Alert subscription lookup fallback: ${error.message}`);
      try {
        const { data, error: fallbackError } = await supabase
          .from('energyrite_emails')
          .select('email')
          .eq('status', 'active')
          .order('email');

        if (fallbackError) throw new Error(`Fallback database error: ${fallbackError.message}`);
        return (data || []).map((r) => ({ email: r.email }));
      } catch (fallbackErr) {
        console.error('Error getting alert recipients (fallback):', fallbackErr.message);
        return [];
      }
    }
  }

  /**
   * Send realtime alert email.
   */
  async sendRealtimeAlertEmail(options) {
    const {
      plate,
      alertType,
      subject,
      statusText = '',
      fuelPercentage = null,
      locTime = '',
      details = ''
    } = options || {};

    try {
      const recipients = await this.getAlertRecipients(plate, alertType);
      if (recipients.length === 0) {
        console.log('⚠️ No email recipients found for realtime alerts');
        return { success: false, message: 'No recipients found' };
      }

      const emails = recipients.map((r) => r.email);
      const finalSubject = subject || `Energy Rite Alert: ${alertType || 'Realtime Event'} - ${plate || 'Unknown Site'}`;
      const generatedAt = new Date().toLocaleString();

      const emailHTML = `
        <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
          <div style="background-color: #7f1d1d; color: #fff; padding: 16px 20px;">
            <h2 style="margin: 0;">Energy Rite Realtime Alert</h2>
          </div>
          <div style="background-color: #f8f9fa; padding: 18px 20px; color: #111;">
            <p style="margin-top: 0;"><strong>Site:</strong> ${plate || 'Unknown'}</p>
            <p><strong>Alert Type:</strong> ${alertType || 'N/A'}</p>
            ${statusText ? `<p><strong>Status:</strong> ${statusText}</p>` : ''}
            ${fuelPercentage !== null && fuelPercentage !== undefined ? `<p><strong>Fuel %:</strong> ${fuelPercentage}%</p>` : ''}
            ${locTime ? `<p><strong>LocTime:</strong> ${locTime}</p>` : ''}
            ${details ? `<p><strong>Details:</strong> ${details}</p>` : ''}
            <p style="margin-bottom: 0;"><strong>Generated:</strong> ${generatedAt}</p>
          </div>
        </div>
      `;

      for (const email of emails) {
        await notificationapi.send({
          type: 'Energy_rite_report',
          to: {
            id: email.replace('@', '_').replace('.', '_'),
            email
          },
          email: {
            subject: finalSubject,
            html: emailHTML,
            senderName: 'Energy Rite Alerts',
            senderEmail: process.env.EMAIL_FROM || 'noreply@energyrite.com'
          }
        });
      }

      console.log(`✅ Realtime alert sent (${alertType}) to ${emails.length} recipients for ${plate}`);
      return { success: true, recipients: emails.length };
    } catch (error) {
      console.error('❌ Failed to send realtime alert email:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send email with report attachment
   */
  async sendReportEmail(options) {
    const { 
      reportType, 
      period, 
      fileName, 
      downloadUrl, 
      costCode, 
      stats 
    } = options;

    try {
      const recipients = await this.getEmailRecipients(costCode);
      if (recipients.length === 0) {
        console.log('⚠️ No email recipients found for reports');
        return { success: false, message: 'No recipients found' };
      }

      const emails = recipients.map(r => r.email);
      const reportTypeName = reportType.charAt(0).toUpperCase() + reportType.slice(1);
      const publicBaseUrl = (process.env.PUBLIC_BASE_URL || process.env.SERVER_PUBLIC_URL || process.env.FRONTEND_BASE_URL || '').replace(/\/$/, '');
      const nextImageFallbackPath = '/_next/image?url=%2Fenergyease_logo_green_orange_1m.png&w=384&q=75';
      const logoUrl = process.env.REPORT_LOGO_URL || (
        publicBaseUrl
          ? `${publicBaseUrl}/assets/energyease_logo_green_orange_1m.png`
          : nextImageFallbackPath
      );
      
      const emailHTML = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #1e3a5f; color: white; padding: 20px; text-align: center;">
            <div style="text-align:center; margin-bottom: 10px;">
              <img src="${logoUrl}" alt="Energyease Logo" style="display:block; margin: 0 auto; max-width: 240px; width: 100%; height: auto;">
            </div>
            <h1>EnergyRite ${reportTypeName} Report</h1>
            <p>${period}</p>
          </div>
          <div style="padding: 20px; background-color: #f8f9fa; color: #333;">
            <p><strong>Hello,</strong></p>
            <p>Your EnergyRite ${reportTypeName} report for ${period} is ready for download.</p>
            
            <div style="background: white; padding: 15px; margin: 15px 0; border-radius: 5px; border-left: 4px solid #1e3a5f;">
              <p><strong>Sites:</strong> ${stats?.total_sites || 0} | <strong>Sessions:</strong> ${stats?.total_sessions || 0}</p>
              ${costCode ? `<p><strong>Cost Code:</strong> ${costCode}</p>` : ''}
              <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
            </div>
            
            <div style="text-align: center; margin: 20px 0;">
              <a href="${downloadUrl}" style="display: inline-block; background-color: #1e3a5f; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                Download Report
              </a>
            </div>
          </div>
        </div>
      `;

      // Send via NotificationAPI
      for (const email of emails) {
        try {
          const result = await notificationapi.send({
            type: 'Energy_rite_report',
            to: {
              id: email.replace('@', '_').replace('.', '_'),
              email: email
            },
            email: {
              subject: `Energy Rite ${reportTypeName} Report - ${period} ${costCode ? `(${costCode})` : ''}`,
              html: emailHTML,
              senderName: 'Energy Rite Reports',
              senderEmail: process.env.EMAIL_FROM || 'noreply@energyrite.com'
            }
          });
          console.log(`✅ Email sent to ${email}:`, result);
        } catch (emailError) {
          console.error(`❌ Failed to send to ${email}:`, emailError.message);
          throw emailError;
        }
      }
      
      console.log(`✅ Report email sent successfully to ${emails.length} recipients`);
      
      return { 
        success: true, 
        recipients: emails.length
      };
      
    } catch (error) {
      console.error('❌ Failed to send report email:', error.message);
      
      return { 
        success: false, 
        error: error.message 
      };
    }
  }
}

module.exports = new EnergyRiteEmailService();

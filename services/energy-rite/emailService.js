/**
 * Energy Rite Email Service
 * Handles sending report emails to configured recipients
 */
const nodemailer = require('nodemailer');
const { supabase } = require('../../supabase-client');

class EnergyRiteEmailService {
  constructor() {
    this.setupTransporter();
  }

  /**
   * Setup email transporter
   */
  setupTransporter() {
    // Create transporter using environment variables
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });

    // Test connection
    this.transporter.verify()
      .then(() => console.log('✅ SMTP connection verified'))
      .catch(error => console.error('❌ SMTP verification failed:', error.message));
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
        // Get emails for specific cost code OR emails that receive all reports
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

  /**
   * Send email with report attachment
   */
  async sendReportEmail(options) {
    const { 
      reportType, 
      period, 
      filePath, 
      fileName, 
      downloadUrl, 
      costCode, 
      stats 
    } = options;

    try {
      // Get email recipients based on cost code
      const recipients = await this.getEmailRecipients(costCode);
      if (recipients.length === 0) {
        console.log('⚠️ No email recipients found for reports');
        return { success: false, message: 'No recipients found' };
      }

      // Extract emails
      const emails = recipients.map(r => r.email);
      
      // Format stats for email
      const formattedStats = {
        sites: stats.total_sites || 0,
        sessions: stats.total_sessions || 0,
        operatingHours: stats.total_operating_hours || '0'
      };

      // Create readable report name
      const reportTypeName = reportType.charAt(0).toUpperCase() + reportType.slice(1);
      
      // Generate HTML email template for report
      const emailHTML = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #1e3a5f; color: white; padding: 20px; text-align: center;">
            <img src="cid:logo" alt="EnergyRite Logo" style="max-width: 120px; height: auto; margin: 0 auto 15px; display: block;">
            <h1>EnergyRite ${reportTypeName} Report</h1>
            <p>${period}</p>
          </div>
          <div style="padding: 20px; background-color: #f8f9fa; color: #333;">
            <p><strong>Hello,</strong></p>
            <p>Your EnergyRite ${reportTypeName} report for ${period} is ready for download.</p>
            
            <div style="background: white; padding: 15px; margin: 15px 0; border-radius: 5px; border-left: 4px solid #1e3a5f;">
              <p><strong>Sites:</strong> ${formattedStats.sites} | <strong>Sessions:</strong> ${formattedStats.sessions} | <strong>Hours:</strong> ${formattedStats.operatingHours}</p>
              ${costCode ? `<p><strong>Cost Code:</strong> ${costCode}</p>` : ''}
              <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
            </div>
            
            <div style="text-align: center; margin: 20px 0;">
              <a href="${downloadUrl}" style="display: inline-block; background-color: #1e3a5f; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;" download="${fileName}">
                Download Report
              </a>
            </div>
            
            <hr style="border: 1px solid #ddd; margin: 20px 0;">
            <p style="font-size: 12px; color: #666; text-align: center;">
              This is an automated message from the EnergyRite system.<br>
              © ${new Date().getFullYear()} EnergyRite - Smart Energy Management
            </p>
          </div>
        </div>
      `;

      // Configure email
      const mailOptions = {
        from: `"Energy Rite Reports" <${process.env.EMAIL_FROM}>`,
        to: emails.join(', '),
        subject: `Energy Rite ${reportTypeName} Report - ${period} ${costCode ? `(${costCode})` : ''}`,
        html: emailHTML,
        attachments: [{
          filename: 'logo.png',
          path: './assets/logo.png',
          cid: 'logo'
        }]
      };

      // Send email with timeout
      const sendWithTimeout = async () => {
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Email sending timeout'));
          }, 10000); // 10 second timeout

          this.transporter.sendMail(mailOptions)
            .then((result) => {
              clearTimeout(timeout);
              resolve(result);
            })
            .catch((error) => {
              clearTimeout(timeout);
              reject(error);
            });
        });
      };

      // Send email
      const result = await sendWithTimeout();
      
      // Log email to database (create email_logs table if needed)
      try {
        await supabase
          .from('energy_rite_email_logs')
          .insert({
            recipients: emails.join(', '),
            subject: mailOptions.subject,
            body: emailHTML,
            email_type: reportType,
            cost_code: costCode,
            sent_at: new Date().toISOString(),
            status: 'sent'
          });
      } catch (logError) {
        console.log('Note: Email logging table may need to be created');
      }
      
      console.log(`✅ Report email sent successfully to ${emails.length} recipients`);
      
      return { 
        success: true, 
        recipients: emails.length,
        messageId: result.messageId 
      };
      
    } catch (error) {
      console.error('❌ Failed to send report email:', error.message);
      
      // Log failed email to database
      try {
        await supabase
          .from('energy_rite_email_logs')
          .insert({
            recipients: 'failed',
            subject: `Energy Rite ${reportType} Report - ${period}`,
            body: 'Email failed to send',
            email_type: reportType,
            cost_code: costCode,
            sent_at: new Date().toISOString(),
            status: 'failed',
            error_message: error.message
          });
      } catch (logError) {
        console.log('Note: Email logging table may need to be created');
      }
      
      return { 
        success: false, 
        error: error.message 
      };
    }
  }
}

module.exports = new EnergyRiteEmailService();
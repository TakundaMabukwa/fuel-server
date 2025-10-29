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
        .select('recipient_email, branch')
        .eq('status', 'active');

      if (costCode) {
        // Get emails for specific cost code OR emails that receive all reports
        query = query.or(`branch.is.null,branch.eq.${costCode}`);
      }

      const { data, error } = await query.order('recipient_email');
      
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
      const emails = recipients.map(r => r.recipient_email);
      
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
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Energy Rite ${reportTypeName} Report</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 800px;
              margin: 0 auto;
              background-color: #f4f4f4;
            }
            .container {
              background-color: white;
              padding: 30px;
              border-radius: 8px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              margin: 20px;
            }
            .header {
              background-color: #0070f3;
              color: white;
              padding: 20px;
              text-align: center;
              border-radius: 8px 8px 0 0;
              margin: -30px -30px 30px -30px;
            }
            .report-details {
              display: flex;
              justify-content: space-between;
              margin-bottom: 30px;
              flex-wrap: wrap;
            }
            .report-info, .stats-info {
              flex: 1;
              min-width: 250px;
              margin: 10px;
            }
            .report-info h3, .stats-info h3 {
              color: #0070f3;
              margin-bottom: 15px;
              border-bottom: 2px solid #0070f3;
              padding-bottom: 5px;
            }
            .button {
              display: inline-block;
              background-color: #28a745;
              color: white;
              padding: 12px 24px;
              text-decoration: none;
              border-radius: 6px;
              margin: 20px 0;
              font-weight: bold;
              text-align: center;
            }
            .button:hover {
              background-color: #218838;
            }
            .footer {
              text-align: center;
              margin-top: 30px;
              font-size: 12px;
              color: #6c757d;
              border-top: 1px solid #e9ecef;
              padding-top: 20px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Energy Rite Report</h1>
              <p>${reportTypeName} Report - ${period}</p>
            </div>
            
            <p>Hello,</p>
            <p>The Energy Rite ${reportTypeName} report for ${period} is now available. You can download it using the link below.</p>
            
            <div class="report-details">
              <div class="report-info">
                <h3>Report Information:</h3>
                <p><strong>Type:</strong> ${reportTypeName} Report</p>
                <p><strong>Period:</strong> ${period}</p>
                <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
                ${costCode ? `<p><strong>Cost Code:</strong> ${costCode}</p>` : ''}
              </div>
              
              <div class="stats-info">
                <h3>Report Statistics:</h3>
                <p><strong>Total Sites:</strong> ${formattedStats.sites}</p>
                <p><strong>Total Sessions:</strong> ${formattedStats.sessions}</p>
                <p><strong>Total Operating Hours:</strong> ${formattedStats.operatingHours}</p>
              </div>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${downloadUrl}" class="button" download="${fileName}">Download Report</a>
            </div>
            
            <p>If you have any questions or need further information, please don't hesitate to contact us.</p>
            
            <div class="footer">
              <p>This is an automated message from the Energy Rite system.</p>
              <p>&copy; ${new Date().getFullYear()} Energy Rite - Smart Energy Made Simple</p>
            </div>
          </div>
        </body>
        </html>
      `;

      // Configure email
      const mailOptions = {
        from: `"Energy Rite Reports" <${process.env.EMAIL_FROM}>`,
        to: emails.join(', '),
        subject: `Energy Rite ${reportTypeName} Report - ${period} ${costCode ? `(${costCode})` : ''}`,
        html: emailHTML,
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
      
      // Log email to database
      await supabase
        .from('energyrite_emails')
        .insert({
          recipient_email: emails.join(', '),
          subject: mailOptions.subject,
          body: emailHTML,
          email_type: reportType,
          branch: costCode,
          sent_at: new Date().toISOString(),
          status: 'sent'
        });
      
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
          .from('energyrite_emails')
          .insert({
            recipient_email: 'failed',
            subject: `Energy Rite ${reportType} Report - ${period}`,
            body: 'Email failed to send',
            email_type: reportType,
            branch: costCode,
            sent_at: new Date().toISOString(),
            status: 'failed',
            error_message: error.message
          });
      } catch (logError) {
        console.error('Failed to log email error:', logError.message);
      }
      
      return { 
        success: false, 
        error: error.message 
      };
    }
  }
}

module.exports = new EnergyRiteEmailService();
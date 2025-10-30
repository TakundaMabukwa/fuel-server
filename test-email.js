require('dotenv').config();
const nodemailer = require('nodemailer');

async function testEmail() {
  console.log('📧 Testing email configuration...');
  console.log('Host:', process.env.EMAIL_HOST);
  console.log('Port:', process.env.EMAIL_PORT);
  console.log('User:', process.env.EMAIL_USER);
  console.log('Secure:', process.env.EMAIL_SECURE);
  
  // Create transporter
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD.replace(/'/g, '')
    }
  });

  // Test connection
  try {
    await transporter.verify();
    console.log('✅ SMTP connection verified');
  } catch (error) {
    console.error('❌ SMTP verification failed:', error.message);
    return;
  }

  // Send test email
  try {
    const result = await transporter.sendMail({
      from: `"EnergyRite Test" <${process.env.EMAIL_FROM}>`,
      to: 'brianm@solflo.co.za',
      subject: 'EnergyRite Email Test',
      html: `
        <h2>Email Test Successful</h2>
        <p>This is a test email from the EnergyRite automated reporting system.</p>
        <p>Time: ${new Date().toLocaleString()}</p>
      `
    });
    
    console.log('✅ Test email sent successfully');
    console.log('Message ID:', result.messageId);
  } catch (error) {
    console.error('❌ Email sending failed:', error.message);
  }
}

testEmail();
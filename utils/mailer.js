const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // 'false' for port 587 (STARTTLS), matches EMAIL_USE_TLS=True
    auth: {
        user: 'acsassdeveloper@gmail.com',      
        pass: 'euka mqlh uxlb dnjn'             
    }
});

/**
 * Sends an OTP email to the user
 */
const sendOtpEmail = async (email, otp) => {
    const mailOptions = {
        from: 'acsassdeveloper@gmail.com', // Sender address
        to: email,                         // Receiver address
        subject: 'Your Registration OTP',  // Subject line
        text: `Your OTP for registration is: ${otp}. It is valid for 10 minutes.` // Plain text body
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`OTP ${otp} sent to ${email}`);
        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        throw new Error('Failed to send email');
    }
};

module.exports = sendOtpEmail;
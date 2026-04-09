const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,     
        pass: process.env.SMTP_PASS             
    }
});


const sendOtpEmail = async (email, otp) => {
    const mailOptions = {
        from: 'acsassdeveloper@gmail.com', 
        to: email,                        
        subject: 'Your Registration OTP',
        text: `Your OTP for registration is: ${otp}. It is valid for 10 minutes.` 
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


const sendEmail = async (email, message , name , phone) => {
    const mailOptions = {
        from: 'acsassdeveloper@gmail.com',
        to: email,                         
        subject: `help for ${name} - ${phone}`, 
        text: `${message}` 
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`message sent to ${email}`);
        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        throw new Error('Failed to send email');
    }
};



module.exports = {sendOtpEmail , sendEmail};
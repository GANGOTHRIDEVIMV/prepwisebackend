const express = require('express');
const router  = express.Router();

const messages = []; // In production use a DB collection or email service

router.post('/send', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ success: false, message: 'Name, email and message are required.' });
    }
    const entry = { name, email, subject: subject || 'General Enquiry', message, createdAt: new Date() };
    messages.push(entry);
    console.log('\n📧  New Contact Message:');
    console.log('   From:', name, '<' + email + '>');
    console.log('   Subject:', entry.subject);
    console.log('   Message:', message.substring(0, 100));
    console.log();
    res.json({ success: true, message: 'Message received! We will get back to you within 24 hours.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not send message. Try again.' });
  }
});

router.get('/messages', (_req, res) => {
  res.json({ success: true, count: messages.length, messages: messages.slice(-20) });
});

module.exports = router;

require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const mongoose  = require('mongoose');
const rateLimit = require('express-rate-limit');

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: ['http://localhost:3000','http://localhost:5500','http://127.0.0.1:5500','http://localhost:5000'], credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/', rateLimit({ windowMs: 15*60*1000, max: 500 }));
app.use('/api/auth/send-otp', rateLimit({ windowMs: 60*1000, max: 5 }));

app.use('/api/auth',      require('./routes/auth'));
app.use('/api/user',      require('./routes/user'));
app.use('/api/interview', require('./routes/interview'));
app.use('/api/recording', require('./routes/recording'));
app.use('/api/resume',    require('./routes/resume'));
app.use('/api/contact',   require('./routes/contact'));

app.get('/api/health', (_req, res) => res.json({ success: true, time: new Date() }));

const fp = f => path.join(__dirname, '../frontend', f);
const pp = f => path.join(__dirname, '../frontend/pages', f);

app.get('/login',    (_,r) => r.sendFile(pp('login.html')));
app.get('/signin',   (_,r) => r.sendFile(pp('login.html')));
app.get('/signup',   (_,r) => r.sendFile(pp('signup.html')));
app.get('/dashboard',(_,r) => r.sendFile(pp('dashboard.html')));
app.get('/interview',(_,r) => r.sendFile(pp('interview.html')));
app.get('/report',   (_,r) => r.sendFile(pp('report.html')));
app.get('/about',    (_,r) => r.sendFile(pp('about.html')));
app.get('/contact',  (_,r) => r.sendFile(pp('contact.html')));
app.get('/features', (_,r) => r.sendFile(pp('features.html')));
app.get('*',         (_,r) => r.sendFile(fp('index.html')));

mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('✅  MongoDB connected successfully');
    app.listen(PORT, () => {
      console.log(`🚀  PrepWise running → http://localhost:${PORT}`);
    });
  })
  .catch(err => { console.error('❌  MongoDB failed:', err.message); process.exit(1); });

module.exports = app;

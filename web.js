const express = require('express');
const path = require('path');
const session = require('express-session');
const config = require('./config.json');
const admin = require('firebase-admin');

const app = express();
const port = config.port;

admin.initializeApp({
  credential: admin.credential.cert(require('./fbadmin.json')),
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: 'mindmirror-secret', // change this in production
  resave: false,
  saveUninitialized: false
}));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.post('/login', async (req, res) => {
  const { email, password, token } = req.body;
  if (!email || !password || !token) {
    return res.status(400).send('Missing fields');
  }
  try {
    const fetch = await import('node-fetch').then(m => m.default);
    const verifyResponse = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${config.recaptcha_secret_key}&response=${token}`
    });
    const verifyData = await verifyResponse.json();
    if (!verifyData.success || verifyData.score < 0.5) {
      return res.status(400).send('reCAPTCHA failed');
    }

    // simulate authentication, for now trust password (in real life, verify with Firebase)
    req.session.user = { email };

    if (email === 'admin@rxo.me') {
      return res.redirect('/admin');
    } else {
      return res.send(`Welcome ${email}! (regular user)`);
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

app.post('/signup', async (req, res) => {
  const { name, email, password, confirm, token } = req.body;
  if (!name || !email || !password || !confirm || !token) {
    return res.status(400).send('Missing fields');
  }
  if (password !== confirm) {
    return res.status(400).send('Passwords do not match');
  }
  try {
    const fetch = await import('node-fetch').then(m => m.default);
    const verifyResponse = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${config.recaptcha_secret_key}&response=${token}`
    });
    const verifyData = await verifyResponse.json();
    if (!verifyData.success || verifyData.score < 0.5) {
      return res.status(400).send('reCAPTCHA failed');
    }

    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: name
    });

    console.log(`Firebase user created: ${userRecord.uid}`);
    res.send(`Signup successful! Welcome, ${name}`);
  } catch (err) {
    console.error(err);
    res.status(500).send(`Error: ${err.message}`);
  }
});

// protect /admin
app.get('/admin', (req, res) => {
  if (req.session.user && req.session.user.email === 'admin@rxo.me') {
    res.sendFile(path.join(__dirname, 'admin.html'));
  } else {
    res.status(403).send('Forbidden');
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

// serve the admin_questions.html
app.get('/admin/questions', (req, res) => {
  if (req.session.user && req.session.user.email === 'admin@rxo.me') {
    res.sendFile(path.join(__dirname, 'admin_questions.html'));
  } else {
    res.status(403).send('Forbidden');
  }
});

// JSON API routes
app.get('/api/questions', async (req, res) => {
  try {
    const snapshot = await db.collection('questions').get();
    const questions = [];
    snapshot.forEach(doc => questions.push({ id: doc.id, ...doc.data() }));
    res.json(questions);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error fetching questions');
  }
});

app.post('/api/questions', async (req, res) => {
  const { text } = req.body;
  try {
    await db.collection('questions').add({
      text,
      options: ["Strongly Agree", "Agree", "Neutral", "Disagree", "Strongly Disagree"]
    });
    res.status(201).send('Question added');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error adding question');
  }
});

app.delete('/api/questions/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await db.collection('questions').doc(id).delete();
    res.send('Deleted');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error deleting');
  }
});

app.put('/api/questions/:id', async (req, res) => {
  const { id } = req.params;
  const { text } = req.body;
  try {
    await db.collection('questions').doc(id).update({ text });
    res.send('Updated');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error updating');
  }
});

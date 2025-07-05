const express = require('express');
const path = require('path');
const config = require('./config.json');
const admin = require('firebase-admin');

const app = express();
const port = config.port;

admin.initializeApp({
  credential: admin.credential.cert(require('./fbadmin.json')),
});
const db = admin.firestore();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

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
    // You might do actual credential checks here later
    res.send('Login successful! (Demo)');
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

// question manager API
app.get('/api/questions', async (req, res) => {
  try {
    const snapshot = await db.collection('questions').get();
    const questions = [];
    snapshot.forEach(doc => {
      questions.push({ id: doc.id, ...doc.data() });
    });
    res.json(questions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/questions/add', async (req, res) => {
  const { text, options } = req.body;
  if (!text || !options || !Array.isArray(options)) {
    return res.status(400).json({ error: 'Missing question text or options' });
  }
  try {
    const ref = await db.collection('questions').add({ text, options });
    res.json({ id: ref.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Add failed' });
  }
});

app.post('/api/questions/update', async (req, res) => {
  const { id, text, options } = req.body;
  if (!id || !text || !options || !Array.isArray(options)) {
    return res.status(400).json({ error: 'Missing data' });
  }
  try {
    await db.collection('questions').doc(id).update({ text, options });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Update failed' });
  }
});

app.post('/api/questions/delete', async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids)) {
    return res.status(400).json({ error: 'Missing ids' });
  }
  try {
    for (const id of ids) {
      await db.collection('questions').doc(id).delete();
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Delete failed' });
  }
});


app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

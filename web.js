const express = require('express');
const path = require('path');
const app = express();
const config = require('./config.json');
const port = config.port;
const recaptchaSecret = config.recaptcha_secret_key;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.post('/signup', async (req, res) => {
  const { name, email, password, confirm, token } = req.body;

  if (!name || !email || !password || !confirm || !token) {
    return res.status(400).send('Missing required fields');
  }
  if (password !== confirm) {
    return res.status(400).send('Passwords do not match');
  }

  try {
    const fetch = await import('node-fetch').then(m => m.default);
    const verifyResponse = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: `secret=${config.recaptcha_secret_key}&response=${token}`
    });
    const verifyData = await verifyResponse.json();
    if (!verifyData.success || verifyData.score < 0.5) {
      return res.status(400).send('reCAPTCHA verification failed');
    }
    console.log(`New signup:
      Name: ${name}
      Email: ${email}
      Password: ${password}
    `);
    res.send('Signup successful! (this is a demo)');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

app.post('/login', async (req, res) => {
  const { name, email, password, confirm, token } = req.body;

  if (!name || !email || !password || !confirm || !token) {
    return res.status(400).send('Missing required fields');
  }

  if (password !== confirm) {
    return res.status(400).send('Passwords do not match');
  }

  try {
    const fetch = await import('node-fetch').then(m => m.default);

    const verifyResponse = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${recaptchaSecret}&response=${token}`
    });

    const verifyData = await verifyResponse.json();

    if (!verifyData.success || verifyData.score < 0.5) {
      return res.status(400).send('reCAPTCHA verification failed');
    }

    console.log(`New login:
    Name: ${name}
    Email: ${email}
    Password: ${password}
    `);

    res.send('Login successful! (this is a demo)');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

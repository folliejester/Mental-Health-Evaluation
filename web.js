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

const db = admin.firestore();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: 'mindmirror-secret',
  resave: false,
  saveUninitialized: false
}));

// serve static files
app.use(express.static(__dirname));

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

    // simple session auth for demo
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

// admin panel protected
app.get('/admin', (req, res) => {
  if (req.session.user && req.session.user.email === 'admin@rxo.me') {
    res.sendFile(path.join(__dirname, 'admin.html'));
  } else {
    res.status(403).send('Forbidden');
  }
});

// API to get questions
app.get('/api/questions', async (req, res) => {
  if (!req.session.user || req.session.user.email !== 'admin@rxo.me') {
    return res.status(403).send('Forbidden');
  }
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

// add question
app.post('/api/questions/add', async (req, res) => {
  if (!req.session.user || req.session.user.email !== 'admin@rxo.me') {
    return res.status(403).send('Forbidden');
  }
  const { text, options } = req.body;
  try {
    // check for duplicate
    const duplicate = await db.collection('questions').where('text', '==', text).get();
    if (!duplicate.empty) {
      return res.status(400).json({ error: 'Question already exists' });
    }

    const ref = await db.collection('questions').add({ text, options });
    res.json({ id: ref.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Add failed' });
  }
});


// update question
app.post('/api/questions/update', async (req, res) => {
  if (!req.session.user || req.session.user.email !== 'admin@rxo.me') {
    return res.status(403).send('Forbidden');
  }
  const { id, text, options } = req.body;
  try {
    await db.collection('questions').doc(id).update({ text, options });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Update failed' });
  }
});

// bulk delete
app.post('/api/questions/delete', async (req, res) => {
  if (!req.session.user || req.session.user.email !== 'admin@rxo.me') {
    return res.status(403).send('Forbidden');
  }
  const { ids } = req.body;
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

// get users list
app.get('/api/users', async (req, res) => {
  if (!req.session.user || req.session.user.email !== 'admin@rxo.me') {
    return res.status(403).send('Forbidden');
  }
  try {
    const listUsers = await admin.auth().listUsers(1000); // max 1000
    const users = listUsers.users.map(u => ({
      uid: u.uid,
      email: u.email,
      displayName: u.displayName || '',
      admin: u.customClaims && u.customClaims.admin === true
    }));
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// delete user
app.post('/api/users/delete', async (req, res) => {
  if (!req.session.user || req.session.user.email !== 'admin@rxo.me') {
    return res.status(403).send('Forbidden');
  }
  const { uid } = req.body;
  try {
    await admin.auth().deleteUser(uid);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Delete failed' });
  }
});

// promote to admin
app.post('/api/users/promote', async (req, res) => {
  if (!req.session.user || req.session.user.email !== 'admin@rxo.me') {
    return res.status(403).send('Forbidden');
  }
  const { uid } = req.body;
  try {
    await admin.auth().setCustomUserClaims(uid, { admin: true });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Promote failed' });
  }
});

app.post('/api/questions/import', async (req, res) => {
  if (!req.session.user || req.session.user.email !== 'admin@rxo.me') {
    return res.status(403).send('Forbidden');
  }
  try {
    const questions = req.body.questions;
    for(const q of questions){
      // check duplicates
      const exists = await db.collection('questions').where('text','==',q.text).get();
      if(exists.empty){
        await db.collection('questions').add({
          text: q.text,
          options: q.options
        });
      }
    }
    res.send("Import done");
  } catch(err){
    console.error(err);
    res.status(500).send("Import failed");
  }
});

app.get('/api/users', async (req, res) => {
  if (!req.session.user || req.session.user.email !== 'admin@rxo.me') {
    return res.status(403).send('Forbidden');
  }
  try {
    const listUsers = await admin.auth().listUsers(1000);
    const users = listUsers.users.map(u => ({
      uid: u.uid,
      name: u.displayName || '',
      email: u.email || '',
      createdAt: u.metadata.creationTime,
      disabled: u.disabled || false
    }));
    res.json(users);
  } catch(err){
    console.error(err);
    res.status(500).send('Error fetching users');
  }
});

app.post('/api/users/update', async (req, res) => {
  const { uid, name, email } = req.body;
  try {
    await admin.auth().updateUser(uid, { displayName: name, email });
    res.send('Updated');
  } catch(err){
    console.error(err);
    res.status(500).send('Update failed');
  }
});

app.post('/api/users/delete', async (req, res) => {
  const { uid } = req.body;
  try {
    await admin.auth().deleteUser(uid);
    res.send('Deleted');
  } catch(err){
    console.error(err);
    res.status(500).send('Delete failed');
  }
});

app.post('/api/users/disable', async (req, res) => {
  const { uid, disable } = req.body;
  try {
    await admin.auth().updateUser(uid, { disabled: disable });
    res.send('Status updated');
  } catch(err){
    console.error(err);
    res.status(500).send('Failed to update status');
  }
});

app.post('/api/users/add', async (req, res) => {
  if (!req.session.user || req.session.user.email !== 'admin@rxo.me') {
    return res.status(403).send('Forbidden');
  }
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).send("Missing fields");
  }
  try {
    const userRecord = await admin.auth().createUser({
      displayName: name,
      email,
      password,
    });
    if(role==="admin"){
      await admin.auth().setCustomUserClaims(userRecord.uid, {admin:true});
    }
    res.send("Created");
  } catch(err){
    console.error(err);
    res.status(500).send(err.message);
  }
});

app.get('/api/questions', async (req,res)=>{
  try {
    const snapshot = await db.collection("questions").get();
    const questions = [];
    snapshot.forEach(doc=>{
      questions.push({id:doc.id, ...doc.data()});
    });
    res.json(questions);
  } catch(err){
    console.error(err);
    res.status(500).send("Error loading questions");
  }
});
app.get('/test', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }

  res.sendFile(path.join(__dirname, 'test.html'));
});

app.post('/test', async (req, res) => {
  if (!req.session.user) {
    return res.status(403).send('Not logged in');
  }

  const answers = req.body.answers;
  if (!answers || Object.keys(answers).length < 1) {
    return res.status(400).send('At least one question must be answered.');
  }

  try {
    const userEmail = req.session.user.email;

    // you could also store these in Firestore
    const docRef = await db.collection('results').add({
      user: userEmail,
      answers: answers,
      created: new Date()
    });

    // build a prompt for AI
    const prompt = `
User with email ${userEmail} completed a mental health test.
Here are their answers:
${JSON.stringify(answers)}
Please write a helpful mental health evaluation in 300 words, and rate these 6 skills 0-100:
- Emotional Stability
- Stress Resilience
- Social Interaction
- Motivation
- Self-Discipline
- Optimism
Return only JSON: {"text": "...", "scores": [..6 numbers..]}
`;

    const hfClient = new InferenceClient(config.hf_token);
    const aiResponse = await hfClient.textGeneration({
      model: "mistralai/Mistral-7B-Instruct-v0.3",
      inputs: prompt,
      parameters: {
        max_new_tokens: 500
      }
    });

    let aiResult;
    try {
      aiResult = JSON.parse(aiResponse.generated_text);
    } catch {
      aiResult = {
        text: "AI evaluation not available.",
        scores: [50,50,50,50,50,50]
      };
    }

    // store result
    await docRef.update({
      evaluation: aiResult.text,
      scores: aiResult.scores
    });

    res.json({
      evaluation: aiResult.text,
      scores: aiResult.scores
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error evaluating');
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

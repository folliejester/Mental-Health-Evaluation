import express from 'express';
import path from 'path';
import session from 'express-session';
import admin from 'firebase-admin';
import { InferenceClient } from "@huggingface/inference";
import config from './config.json' with { type: "json" };
import fbAdminConfig from './fbadmin.json' with { type: "json" };
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = config.port;

admin.initializeApp({
  credential: admin.credential.cert(fbAdminConfig)
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
      return res.redirect('/test');
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
    res.redirect('/test');
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
    res.redirect('/login');
  }
});

// API to get questions
app.get('/api/questions', async (req, res) => {
  if (!req.session.user || req.session.user.email !== 'admin@rxo.me') {
    res.redirect('/login');
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
    return res.redirect('/login');
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
    return res.redirect('/login');
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

  const rawAnswers = req.body.answers;
const questionsSnap = await db.collection('questions').get();
const questionList = [];
questionsSnap.forEach(doc => {
  questionList.push(doc.data().text);
});

const answers = {};
Object.keys(rawAnswers).forEach((key, idx) => {
  const qIndex = parseInt(key.replace('q', ''));
  const questionText = questionList[qIndex];
  if (questionText) {
    answers[questionText] = rawAnswers[key];
  }
});

  if (!answers || Object.keys(answers).length < 1) {
    return res.status(400).send('At least one question must be answered.');
  }

  try {
    const userEmail = req.session.user.email;

    // Save or replace by using email as document ID
    const docRef = db.collection('results').doc(userEmail);

    await docRef.set({
      user: userEmail,
      answers,
      created: new Date()
    });

    const summarizedAnswers = Object.entries(answers).slice(0, 30).map(([k, v]) => `${k}: ${v}`).join(", ");
    const prompt = `
I just finished a mental health assessment. Top answers:
${summarizedAnswers}
Write me a paragraph on my mental and psychological health evaluation discussing the problems if any and it's solutions in around 300 words.
`;

    const hfClient = new InferenceClient(config.hugging_face_key);
    const aiResponse = await hfClient.chatCompletion({
      model: "mistralai/Mistral-7B-Instruct-v0.3",
      provider: "novita",
      messages: [
        { role: "system", content: "Mental and psychological health evaluation" },
        { role: "user", content: prompt }
      ]
    });

    const evaluationText = aiResponse.choices[0].message.content;

    // Update the same document with evaluation
    await docRef.update({ evaluation: evaluationText });

    res.json({ evaluation: evaluationText });

  } catch (err) {
    console.error(err);
    res.status(500).send('Error evaluating');
  }
});


app.get('/api/questions-user', async (req,res)=>{
  try{
    const snap = await db.collection('questions').get();
    const list = [];
    snap.forEach(doc=>{
      list.push({ id: doc.id, ...doc.data() });
    });
    res.json(list);
  }catch(e){
    console.error(e);
    res.status(500).send('Failed to load questions');
  }
});

app.get('/test', (req,res)=>{
  res.sendFile(path.join(__dirname,'test.html'));
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

app.get('/api/stats', async (req, res) => {
  if (!req.session.user || req.session.user.email !== 'admin@rxo.me') {
    return res.status(403).send('Forbidden');
  }
  try {
    const snapshot = await db.collection('results').get();
    const totalAttempts = snapshot.size;
    res.json({ totalAttempts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/feedback', async (req, res) => {
  try {
    const { rating, feedback } = req.body;
    if (!req.session.user) return res.status(403).send("Not logged in");

    await db.collection("feedback").add({
      user: req.session.user.email,
      rating: rating ? Number(rating) : null,
      feedback,
      created: new Date()
    });
    res.json({ success: true });
  } catch(err){
    console.error(err);
    res.status(500).send("Feedback failed");
  }
});

app.get('/api/feedback', async (req, res) => {
  try {
    const snapshot = await db.collection('feedbacks').get();
    const feedbacks = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    res.json(feedbacks);
  } catch (err) {
    console.error(err);
    res.status(500).send("Could not fetch feedback");
  }
});

app.get('/api/reports/:email', async (req, res) => {
  const { email } = req.params;
  try {
    const docRef = db.collection('results').doc(email);
    const snapshot = await docRef.get();

    if (!snapshot.exists) {
      return res.status(404).send("Report not found");
    }

    const data = snapshot.data();

    res.json({
      email,
      name: data.name || '',
      rating: data.rating || '',
      feedback: data.feedback || '',
      evaluation: data.evaluation || '',
      answers: data.answers || []
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});



app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
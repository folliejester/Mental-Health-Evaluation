# 🧠 MindMirror — Mental Health Evaluation App

A web-based mental health evaluation app that uses AI to assess user inputs and generate personalized psychological insights. Built with **Express**, **Firebase**, and **Mistral** (via Hugging Face), the app supports secure login sessions and features an **admin panel** to monitor user reports.

---

## ✨ Features

- **📋 Mental Health Quiz**  
  Users answer a set of curated questions to assess their mental state.

- **🤖 AI-Powered Evaluation**  
  Answers are processed using the Mistral model (Hugging Face) to generate insightful feedback.

- **🔐 Secure Login System**  
  Session-based authentication for user access and result tracking.

- **🗂️ Firebase Firestore Integration**  
  Stores user answers and AI-generated results securely and per user (via email).

- **🧑‍💼 Admin Panel**  
  Allows admins to:
  - View all user submissions
  - Access detailed results and AI feedback
  - Search users by email
  - Monitor platform usage

---

## 🚀 Installation

1. **Clone the Repository**
   ```bash
   git clone https://github.com/folliejester/Mental-Health-Evaluation.git
   cd Mental-Health-Evaluation
   ```

2. **Install Dependencies**
   ```bash
   npm i
   ```

3. **Setup Firebase**
   - Create a Firebase project
   - Enable Firestore
   - Set up your Firebase credentials in `fbadmin.json` file

4. **Configure Hugging Face Access**
   - Get your Hugging Face API key and Mistral model endpoint
   - Store it in `config.json`

5. **Run the App**
   ```bash
   node web.js
   ```

6. **Visit the App**
   ```
   http://localhost:3000
   ```

---

## 🧠 How It Works

1. User logs in via Firebase.
2. They complete a mental health questionnaire.
3. Responses are sent to a backend route.
4. The Mistral model processes the responses via Hugging Face API.
5. The evaluation and answers are stored in Firestore.
6. Admins can view these evaluations through the admin panel.

---

## 📌 License

MIT License

---

Build self-awareness with AI. Reflect, understand, and grow with **MindMirror**. 💬🧘‍♂️

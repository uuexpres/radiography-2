// ✅ Core Modules & Packages
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const fs = require('fs');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));



// ✅ Initialize Express App First
const app = express();

// ✅ Create HTTP Server and Initialize Socket.IO
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);

// ✅ Port
const port = 3000;

// ✅ Middleware Setup
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,               // must remain false if not using HTTPS
    maxAge: 1000 * 60 * 30       // ✅ 30 minutes
  }
}));

app.use(express.urlencoded({ extended: true }));

// ✅ MongoDB Connection
mongoose.connect('mongodb+srv://mac45:v47JmiGYELJymsMf@cluster0.rwhns6e.mongodb.net/radiographytestappss', {})
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// ✅ Schemas & Models
const questionSchema = new mongoose.Schema({
  testId: { type: mongoose.Schema.Types.ObjectId, ref: 'Test', required: true },

  title: { type: String, required: true },              // 📄 Question text
  choices: { type: [String], required: true },          // 🔢 List of choices (e.g., A–D)
  correctAnswer: { type: String, required: true },      // ✅ Correct choice

  explanation: String,                                  // 💬 Optional explanation
  category: String,                                     // 🗂️ Optional topic/category

  imageUrls: { type: [String], default: [] },           // 📷 List of uploaded image filenames
  imageLabels: { type: [String], default: [] },         // 🏷️ List of labels like "Image A", "Figure 2"

  assignedAt: Date,                                     // 📌 When assigned to a test
  createdAt: { type: Date, default: Date.now },         // 🕒 Timestamp
  choiceCounts: { type: [Number], default: [] }         // 📊 Vote tracking
});

const testSchema = new mongoose.Schema({
  title: { type: String, required: true, unique: true },
  description: String,
  category: String,
  timeLimit: Number,
  isActive: { type: Boolean, default: true },
  startDate: Date,
  endDate: Date,
  maxUsers: { type: Number, default: 0 },
  isOpenAccess: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});
const resultSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  testId: { type: mongoose.Schema.Types.ObjectId, ref: 'Test', required: true },
  
  score: Number,
  totalQuestions: Number,
  correctAnswers: Number,

  detailedResults: [{
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
    selectedAnswer: String,
    correctAnswer: String,
    isCorrect: Boolean
  }],

  timeTaken: { type: Number, default: 0 }, // ⏱️ Total time in seconds

  // ⏱️ New: Track time spent per question
  questionTimings: [{
    questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
    timeSpent: Number // in seconds
  }],

  createdAt: { type: Date, default: Date.now }
});

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  isActive: { type: Boolean, default: true },
  lastSeen: { type: Date, default: Date.now },
  isOnline: { type: Boolean, default: false },
  lastActive: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },

  // 🌍 Location fields
  country: { type: String, default: '' },
  state: { type: String, default: '' }, // Changed from 'city' to 'state'
  examDate: { type: Date }
});


// models/TestProgress.js


const TestProgressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  testId: { type: mongoose.Schema.Types.ObjectId, ref: 'Test', required: true },
  index: { type: Number, default: 0 }, // current question number
  total: { type: Number, required: true },
  status: { type: String, enum: ['active', 'completed', 'exited'], default: 'active' },
  updatedAt: { type: Date, default: Date.now },
});

const TestProgress = mongoose.models.TestProgress || mongoose.model('TestProgress', TestProgressSchema);


const Question = mongoose.model('Question', questionSchema);
const Test = mongoose.model('Test', testSchema);
const Result = mongoose.model('Result', resultSchema);
const User = mongoose.model('User', userSchema);

// ✅ File Upload Setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Save files to 'uploads/' directory
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const sanitized = file.originalname.replace(/\s+/g, '-').toLowerCase();
    cb(null, `${timestamp}-${sanitized}`);
  }
});

// ✅ Route to get user count
app.get('/api/user-count', async (req, res) => {
  const count = await User.countDocuments();
  res.json({ count });
});


const upload = multer({ storage });

// ✅ Middleware: Upload handler for multiple fields (e.g., reference and explanation images)
const uploadMultiple = upload.fields([
  { name: 'referenceImages', maxCount: 5 },
  { name: 'explanationImages', maxCount: 5 }
]);

// ✅ Online User Tracking with Socket.IO
const onlineUsers = new Map();

io.on('connection', (socket) => {
  const userId = socket.handshake.query.userId;

  if (userId) {
    onlineUsers.set(userId, socket.id);
    User.findByIdAndUpdate(userId, {
      isOnline: true,
      lastSeen: new Date()
    }).catch(console.error);
    console.log(`🟢 User connected: ${userId}`);
  }

  socket.on('disconnect', async () => {
    if (userId) {
      onlineUsers.delete(userId);
      await User.findByIdAndUpdate(userId, {
        isOnline: false,
        lastSeen: new Date()
      }).catch(console.error);
      console.log(`🔴 User disconnected: ${userId}`);
    }
  });
});





// Dummy FCM send for testing (no actual push, just log to console)
async function notifyLogin(user, deviceToken) {
  console.log('🛎️ notifyLogin CALLED with:', user.name, deviceToken);

  // If you want to skip FCM for now, just print
  // Uncomment this if you want to skip sending FCM for now
  // return;

  // -- If using FCM, fill in the following:
  const fcmEndpoint = 'https://fcm.googleapis.com/fcm/send';
  const serverKey = 'YOUR_REAL_FCM_SERVER_KEY';
  const message = {
    to: deviceToken,
    notification: {
      title: 'Login Successful!',
      body: `User ${user.name} just logged in.`
    }
  };

  const res = await fetch(fcmEndpoint, {
    method: 'POST',
    headers: {
      'Authorization': `key=${serverKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(message)
  });
  const data = await res.json();
  console.log('📦 FCM response:', data);
}




////// Results //////
app.get('/user/results', async (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.redirect('/login');

  const results = await Result.find({ userId }).populate('testId').sort({ createdAt: -1 });

  const rows = results.map(r => `
    <tr>
      <td>${r.testId ? r.testId.title : '— Deleted Test —'}</td>
      <td>${r.score}%</td>
      <td>${r.correctAnswers}/${r.totalQuestions}</td>
      <td>${new Date(r.createdAt).toLocaleDateString()}</td>
    </tr>
  `).join('');

  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>My Results – Radiography Assistant</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f8f9fb; margin: 0; padding: 40px; }
    h2 { color: #0f1f3e; }
    table {
      width: 100%; border-collapse: collapse; background: #ffffff;
      box-shadow: 0 2px 6px rgba(0,0,0,0.05); margin-top: 20px;
    }
    th, td {
      padding: 14px; text-align: left; font-size: 14px;
      border-bottom: 1px solid #eee;
    }
    th {
      background: #0f1f3e; color: white;
      text-transform: uppercase; font-size: 12px;
    }
    tr:hover { background-color: #f6f9ff; }
  </style>
</head>
<body>
  <h2>📈 My Test Results</h2>
  <table>
    <thead>
      <tr>
        <th>Test</th>
        <th>Score</th>
        <th>Correct</th>
        <th>Date</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>
  `);
});





/////Resutl///////

app.get('/login', (req, res) => {
  const usStates = [
    'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
    'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
    'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan',
    'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada','New Hampshire',
    'New Jersey','New Mexico','New York','North Carolina','North Dakota','Ohio',
    'Oklahoma','Oregon','Pennsylvania','Rhode Island','South Carolina','South Dakota',
    'Tennessee','Texas','Utah','Vermont','Virginia','Washington','West Virginia',
    'Wisconsin','Wyoming'
  ];

  const canadianProvinces = [
    'Alberta','British Columbia','Manitoba','New Brunswick','Newfoundland and Labrador',
    'Nova Scotia','Ontario','Prince Edward Island','Quebec','Saskatchewan','Northwest Territories',
    'Nunavut','Yukon'
  ];

  const usOptions = usStates.map(s => `<option value="${s}">${s}</option>`).join('');
  const caOptions = canadianProvinces.map(p => `<option value="${p}">${p}</option>`).join('');

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Login – Radiography Assistant</title>
      <style>
        body {
          font-family: 'Segoe UI', sans-serif;
          background: white;
          padding: 60px;
          text-align: center;
          color: #0f1f3e;
        }
        form {
          background: #fff;
          max-width: 500px;
          margin: auto;
          padding: 30px;
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        h2 { margin-bottom: 20px; }
        input, select {
          width: 90%;
          padding: 10px;
          margin: 10px 0;
          border: 1px solid #ccc;
          border-radius: 6px;
          font-size: 16px;
        }
        button {
          background: #007bff;
          color: white;
          padding: 10px 20px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: bold;
        }
        button:hover {
          background: #0056b3;
        }
      </style>
    </head>
    <body>
      <form method="POST" action="/login">
        <h2>Student Login</h2>
        <input type="text" name="name" placeholder="Full Name" required /><br>
        <input type="email" name="email" placeholder="Email Address" required /><br>

        <select name="country" id="countrySelect" onchange="updateRegionOptions()" required>
          <option value="">🌍 Select Country</option>
          <option value="Canada">🇨🇦 Canada</option>
          <option value="United States">🇺🇸 United States</option>
          <option value="Other">🌐 Other</option>
        </select><br>

        <select name="state" id="regionSelect" required>
          <option value="">🏛️ Select Province/State</option>
        </select><br>

        <label>📅 Exam Date:</label><br>
        <input type="date" name="examDate" required /><br>

        <button type="submit">Enter</button>
      </form>

      <script>
        const regions = {
          "Canada": \`${caOptions}\`,
          "United States": \`${usOptions}\`
        };

        function updateRegionOptions() {
          const country = document.getElementById("countrySelect").value;
          const regionSelect = document.getElementById("regionSelect");
          regionSelect.innerHTML = '<option value="">🏛️ Select Province/State</option>' + (regions[country] || '');
        }
      </script>
    </body>
    </html>
  `);
});



app.post('/login', async (req, res) => {
  const { name, email, country, state, examDate, deviceToken } = req.body;

  // 🔍 Debug Logging
  console.log('📥 Login Form Submission Received:');
  console.log('Name:', name);
  console.log('Email:', email);
  console.log('Country:', country);
  console.log('State/Province:', state);
  console.log('Exam Date:', examDate);
  console.log('Device Token:', deviceToken);

  if (!name || !email) {
    return res.send('<h3>Missing fields. Go back and enter both name and email.</h3>');
  }

  let user = await User.findOne({ email });
  if (!user) {
    user = await User.create({
      name,
      email,
      country,
      state,
      examDate
    });
    console.log(`🆕 Created new user: ${name} (${email})`);
  }

  req.session.userId = user._id;
  req.session.userName = user.name;
  console.log(`🚀 Login successful – redirecting to /test-center`);

  notifyLogin(user, deviceToken); // Optional push logic

  res.redirect('/test-center');
});


app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

app.post('/submit-test', async (req, res) => {
  const { testId, ...answers } = req.body;
  const questions = await Question.find({ testId });

  let correctCount = 0;

  const detailedResults = await Promise.all(
    questions.map(async (q) => {
      const selected = answers[`q_${q._id}`];
      const correct = q.correct || q.correctAnswer || ''; // safe fallback
      const isCorrect = selected === correct;
      if (isCorrect) correctCount++;

      // ✅ Update vote counts
      if (selected) {
        const index = ['A', 'B', 'C', 'D'].indexOf(selected);
        if (index !== -1) {
          if (!Array.isArray(q.choiceCounts) || q.choiceCounts.length !== 4) {
            q.choiceCounts = [0, 0, 0, 0];
          }
          q.choiceCounts[index]++;
          await q.save();
        }
      }

      return {
        questionId: q._id,
        selectedAnswer: selected || '',
        correctAnswer: correct,
        isCorrect
      };
    })
  );

  const score = Math.round((correctCount / questions.length) * 100);

  const result = new Result({
    testId,
    userId: req.session?.userId || null,
    score,
    totalQuestions: questions.length,
    correctAnswers: correctCount,
    detailedResults
  });

  await result.save();

  res.send(`
    <html>
      <head>
        <title>Test Submitted</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 40px;
            background: #f4f6f8;
          }
          .result-box {
            background: #fff;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            max-width: 600px;
            margin: auto;
            text-align: center;
          }
          h2 {
            color: #2e7d32;
          }
          a {
            display: inline-block;
            margin-top: 20px;
            background: #1a358d;
            color: white;
            text-decoration: none;
            padding: 10px 20px;
            border-radius: 5px;
          }
          a:hover {
            background: #0d245c;
          }
        </style>
      </head>
      <body>
        <div class="result-box">
          <h2>✅ Test Submitted</h2>
          <p><strong>Score:</strong> ${score}%</p>
          <p><strong>Correct Answers:</strong> ${correctCount} / ${questions.length}</p>
          <a href="/user/analytics">📊 View Analytics</a>
        </div>
      </body>
    </html>
  `);
});

// GET /submit-test-final/:testId — styled final result
app.get('/submit-test-final/:testId', async (req, res) => {
  const { testId } = req.params;
  const userId = req.session.userId || null;
  const userAnswers = req.session.answers || {};
  const questionTimes = req.session.questionTimes || {};
  const startTime = req.session.testStartTime || null;

  const test = await Test.findById(testId);
  const questions = await Question.find({ testId }).sort({ _id: 1 });

  if (!test || questions.length === 0) {
    return res.send('<h2>Invalid test or no questions found.</h2>');
  }

  let correctCount = 0;
  const detailedResults = [];

  for (const question of questions) {
    const qid = question._id.toString();
    const selected = userAnswers[`q_${qid}`] || '';
    const correct = question.correctAnswer || '';
    const isCorrect = selected === correct;
    const timeSpent = questionTimes[qid] || 0;

    if (isCorrect) correctCount++;

    detailedResults.push({
      questionId: question._id,
      selectedAnswer: selected,
      correctAnswer: correct,
      isCorrect,
      timeSpent
    });
  }

  const totalTime = startTime ? Math.floor((Date.now() - new Date(startTime)) / 1000) : 0;

  const result = new Result({
    userId,
    testId,
    score: Math.round((correctCount / questions.length) * 100),
    totalQuestions: questions.length,
    correctAnswers: correctCount,
    detailedResults,
    timeTaken: totalTime
  });

  await result.save();
  delete req.session.answers;
  delete req.session.questionTimes;
  delete req.session.testStartTime;

  const resultRows = questions.map((q, i) => {
    const r = detailedResults[i];
    const timeDisplay = `${Math.floor(r.timeSpent / 60)}m ${r.timeSpent % 60}s`;
    return `
      <tr style="background:${r.isCorrect ? '#e6f9e6' : '#fde7e7'};">
        <td>${i + 1}</td>
        <td>${q.title}</td>
        <td>${r.selectedAnswer || '—'}</td>
        <td>${r.correctAnswer}</td>
        <td>${r.isCorrect ? '✅' : '❌'}</td>
        <td>${timeDisplay}</td>
      </tr>
    `;
  }).join('');

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${test.title} — Final Result</title>
      <style>
        body { margin: 0; font-family: Arial; background: #f8f9fb; display: flex; }
        .sidebar {
          width: 220px; background: #fff; padding: 20px; height: 100vh; border-right: 1px solid #ddd;
        }
        .sidebar h2 {
          font-size: 18px; margin-bottom: 20px; color: #0f1f3e;
        }
        .sidebar nav {
          display: flex; flex-direction: column; gap: 8px;
        }
        .sidebar nav .section-title {
          margin-top: 15px; margin-bottom: 6px;
          font-size: 13px; font-weight: bold; color: #666;
          text-transform: uppercase; border-bottom: 1px solid #ddd; padding-bottom: 4px;
        }
        .sidebar nav a {
          text-decoration: none; color: #0f1f3e; font-size: 14px; padding-left: 10px;
        }
        .sidebar nav a:hover {
          text-decoration: underline;
        }
        .main {
          flex: 1; padding: 40px; background: #fff;
        }
        h3 {
          color: #0f1f3e;
        }
        table {
          width: 100%; border-collapse: collapse; background: #fff; margin-top: 20px;
        }
        th, td {
          padding: 10px 12px; text-align: left;
          border-bottom: 1px solid #e0e0e0; font-size: 14px;
        }
        th {
          background: #f4f4f4;
        }
        td a {
          color: #007bff;
          text-decoration: none;
        }
        td a:hover {
          text-decoration: underline;
        }
        .summary-box {
          font-size: 16px;
          background: #f1f4f8;
          padding: 18px;
          border-radius: 6px;
          margin-bottom: 24px;
          border-left: 4px solid #1a358d;
        }
        .btn-back {
          display: inline-block;
          background-color: #1a358d;
          color: white;
          padding: 10px 22px;
          font-size: 14px;
          font-weight: bold;
          border-radius: 6px;
          text-decoration: none;
          margin-top: 24px;
        }
        .btn-back:hover {
          background-color: #122a6d;
        }
      </style>
    </head>
    <body>
      <div class="sidebar">
        <h2>🩻 Radiography</h2>
        <nav>
          <div class="section-title">Management</div>
          <div class="section-title">Analytics</div>
          
        </nav>
      </div>

      <div class="main">
        <h3>${test.title} — Final Result</h3>

        <div class="summary-box">
          <div>🎯 <strong>Score:</strong> ${correctCount} / ${questions.length} (${Math.round((correctCount / questions.length) * 100)}%)</div>
          <div>⏱️ <strong>Total Time:</strong> ${Math.floor(totalTime / 60)} min ${totalTime % 60} sec</div>
        </div>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Question</th>
              <th>Selected</th>
              <th>Correct</th>
              <th>✅/❌</th>
              <th>⏱️ Time</th>
            </tr>
          </thead>
          <tbody>
            ${resultRows}
          </tbody>
        </table>

        <a class="btn-back" href="/test-center">← Back to Test Center</a>
      </div>
    </body>
    </html>
  `);
});


app.get('/start-test/:testId', async (req, res) => {
  const { testId } = req.params;
  const questionIndex = parseInt(req.query.index || '0');
  const feedbackEnabled = req.query.feedback === 'true';
  const userAnswer = req.query.selected || null;
  const userId = req.session.userId;

  if (questionIndex === 0 && !req.session.testStartTime) {
    req.session.testStartTime = Date.now();
  }
  req.session.questionStartTime = Date.now();

  if (userId) {
    const now = new Date();
    const user = await User.findById(userId).select('lastSeen');
    const updates = { lastActive: now };
    if (!user.lastSeen || now - user.lastSeen > 60 * 1000) updates.lastSeen = now;
    await User.findByIdAndUpdate(userId, updates);
  }

  const test = await Test.findById(testId);
  const questions = await Question.find({ testId }).sort({ _id: 1 });
  if (!test.isActive || !questions[questionIndex]) {
    return res.send('<h2>Test not available</h2>');
  }

  const question = questions[questionIndex];
  const totalQuestions = questions.length;
  const correctAnswer = question.correct || null;
  const totalVotes = question.choiceCounts?.reduce((a, b) => a + b, 0) || 0;
  const progressPercent = Math.round(((questionIndex + 1) / totalQuestions) * 100);

  if (userId) {
    await TestProgress.findOneAndUpdate(
      { userId, testId },
      {
        $set: {
          index: questionIndex,
          total: totalQuestions,
          updatedAt: new Date(),
          status: 'active'
        }
      },
      { upsert: true }
    );
  }

  const answerBlock = question.choices?.length ? `
    <div class="answer-list">
      ${question.choices.map((choice, i) => {
        const letter = String.fromCharCode(65 + i);
        const count = question.choiceCounts?.[i] || 0;
        const percent = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
        const isCorrect = letter === correctAnswer;
        const isSelected = letter === userAnswer;
        return `
          <label class="answer-option ${feedbackEnabled ? (isCorrect ? 'correct-choice' : isSelected ? 'wrong-choice' : '') : ''}">
            <input type="radio" name="answer" value="${letter}" ${isSelected ? 'checked' : ''} ${feedbackEnabled ? 'disabled' : ''} required />
            <span>${letter}.</span>
            <span>${choice}</span>
            ${feedbackEnabled ? `<span style="margin-left:auto; color:#888;">(${percent}%)</span>` : ''}
          </label>
        `;
      }).join('')}
    </div>
  ` : '<p style="color:red;">No choices provided for this question.</p>';

  let section2 = '';
  const hasImages = question.imageUrls && question.imageUrls.length > 0;
  if (hasImages) {
    const mainImgSrc = `/uploads/${question.imageUrls[0]}`;
    const mainImgLabel = question.imageLabels?.[0] || 'Image A';
    section2 = `
      <div class="section-two">
        <div class="section2-header">Section 2: X-ray Image Viewer</div>
        <div id="xray-viewer">
          <div id="main-image-label">${mainImgLabel}</div>
          <img 
            id="main-xray-image"
            src="${mainImgSrc}"
            alt="${mainImgLabel}"
            style="max-width:95%; max-height:360px; background:#181818; cursor: zoom-in;"
          />
          ${question.imageUrls.length > 1 ? `
            <div class="xray-thumbs">
              ${question.imageUrls.map((img, i) => `
                <img 
                  src="/uploads/${img}" 
                  class="thumb-img"
                  id="thumb-${i}"
                  alt="${question.imageLabels?.[i] || `Image ${String.fromCharCode(65+i)}`}" />
              `).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  } else {
    section2 = `<div style="visibility:hidden"></div>`;
  }

  const explanationSection = feedbackEnabled ? `
    <div class="explanation-rect">
      <div class="explanation-label">Section 3: Explanation</div>
      <div>${question.explanation || '<span style="color:#888;">No explanation provided.</span>'}</div>
    </div>
  ` : '';

  const gridContent = `
    <div class="quiz-grid">
      <div class="main-section">
        <div class="section-label">Section 1: Question & Answers</div>
        <div class="question-stem">${question.title}</div>
        <form action="/submit-question" method="POST">
          <input type="hidden" name="testId" value="${testId}" />
          <input type="hidden" name="questionId" value="${question._id}" />
          <input type="hidden" name="index" value="${questionIndex}" />
          ${answerBlock}
          <div class="button-row">
            ${
              !feedbackEnabled
                ? `<button type="submit" class="btn-submit">Submit Answer</button>`
                : questionIndex + 1 < totalQuestions
                  ? `<a href="/start-test/${testId}?index=${questionIndex + 1}" class="btn-submit">Next Question</a>`
                  : `<a href="/submit-test-final/${testId}" class="btn-submit">Finish Test</a>`
            }
          </div>
        </form>
      </div>
      ${section2}
    </div>
  `;

  const pageHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>${test.title}</title>
        <style>
          body { font-family: 'Segoe UI', sans-serif; margin: 0; padding: 0; background: #fff; }
          .progress-uber { width: 100%; max-width: 900px; margin: 22px auto; height: 16px; background: #e0e6ef; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 12px #0001; }
          .progress-uber-fill { width: ${progressPercent}%; height: 100%; background: #28a745; transition: width 0.5s ease-in-out; }
          .progress-uber-label { text-align: center; font-size: 15px; font-weight: bold; margin-top: 10px; color: #222; }
          .topbar, .topbar.bottom { background: #1a358d; color: #fff; padding: 12px 28px; font-size: 17px; font-weight: 500; text-align: center; }
          .topbar.bottom { position: fixed; bottom: 0; left: 0; right: 0; z-index: 100; }
          .quiz-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; padding: 30px 40px 0 40px; }
          .main-section { background: #fff; border-radius: 14px; box-shadow: 0 1px 5px rgba(0,0,0,0.06); padding: 20px; }
          .section-two {
            background: #000;
            color: #fff;
            border-radius: 14px;
            box-shadow: 0 1px 5px rgba(0,0,0,0.3);
            padding: 20px;
            overflow: hidden;
            max-width: 100%;
          }
          .section2-header {
            font-weight: 700;
            font-size: 17px;
            color: #fff;
            background: #111;
            padding: 10px 18px;
            border-radius: 8px;
            margin-bottom: 15px;
            text-align: center;
          }
          #main-image-label {
            color: #fff;
            text-align: center;
            margin-bottom: 10px;
          }
          #xray-viewer {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
          }
          .question-stem { font-size: 17px; font-weight: 500; margin-bottom: 24px; color: #263343; }
          .answer-list { display: flex; flex-direction: column; gap: 16px; margin-top: 10px; }
          .answer-option { display: flex; align-items: center; gap: 11px; font-size: 15px; }
          .answer-option input[type='radio'] { width: 1.1em; height: 1.1em; border: 1.5px solid #aaa; border-radius: 50%; margin-right: 8px; cursor: pointer; }
          .correct-choice { background-color: #e6f4ea; border-left: 4px solid #28a745; padding-left: 8px; }
          .wrong-choice { background-color: #fbeaea; border-left: 4px solid #e53935; padding-left: 8px; }
          .button-row { margin-top: 20px; }
          .btn-submit { padding: 10px 22px; background: #1a358d; color: #fff; font-weight: bold; border: none; border-radius: 6px; cursor: pointer; }
          .btn-submit:hover { background: #16306f; }
          .explanation-rect { padding: 30px; margin-top: 30px; background: #f9f9f9; border-top: 1px solid #ddd; }
          .explanation-label { font-weight: bold; margin-bottom: 10px; font-size: 18px; }

          .xray-thumbs {
            display: flex;
            flex-wrap: nowrap;
            overflow-x: auto;
            gap: 8px;
            padding-top: 12px;
            max-width: 100%;
            border-top: 1px solid #666;
            margin-top: 16px;
          }

          .thumb-img {
            height: 80px;
            object-fit: cover;
            border: 2px solid #ccc;
            border-radius: 6px;
            cursor: pointer;
            flex-shrink: 0;
            background: #fff;
          }

          .timer-bar {
            text-align: center;
            font-size: 15px;
            margin-top: 8px;
            color: #444;
          }
        </style>
      </head>
      <body>
        <div class="topbar">Item ${questionIndex + 1} of ${totalQuestions}</div>
        <div class="progress-uber-label">Progress: Question ${questionIndex + 1} of ${totalQuestions}</div>
        <div class="progress-uber">
          <div class="progress-uber-fill"></div>
        </div>
        <div class="timer-bar">
          ⏱️ <span id="test-timer">Loading test time...</span> | 🕒 <span id="question-timer">Loading question time...</span>
        </div>
        ${gridContent}
        ${explanationSection}
        <div class="topbar bottom">Item ${questionIndex + 1} of ${totalQuestions}</div>

        <script>
          const testStart = ${req.session.testStartTime || Date.now()};
          const questionStart = ${Date.now()};

          function formatTime(seconds) {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return mins + 'm ' + secs + 's';
          }

          function updateTimers() {
            const now = Date.now();
            const testElapsed = Math.floor((now - testStart) / 1000);
            const questionElapsed = Math.floor((now - questionStart) / 1000);
            document.getElementById('test-timer').textContent = formatTime(testElapsed);
            document.getElementById('question-timer').textContent = formatTime(questionElapsed);
          }

          setInterval(updateTimers, 1000);
        </script>
      </body>
    </html>
  `;

  res.send(pageHtml);
});



app.post('/submit-question', async (req, res) => {
  const { testId, questionId, index, answer } = req.body;
  const currentIndex = parseInt(index, 10);
  const userId = req.session.userId;

  // Save answer in session
  if (!req.session.answers) req.session.answers = {};
  req.session.answers[`q_${questionId}`] = answer;

  try {
    // Update vote counts
    const question = await Question.findById(questionId);
    const answerIdx = answer.charCodeAt(0) - 65;

    if (!Array.isArray(question.choiceCounts) || question.choiceCounts.length !== question.choices.length) {
      question.choiceCounts = Array(question.choices.length).fill(0);
    }

    question.choiceCounts[answerIdx]++;
    await question.save();

    // ⏱️ Track time spent on question
    const now = Date.now();
    const questionStart = req.session.questionStartTime || now;
    const testStart = req.session.testStartTime || now;
    const timeSpent = Math.floor((now - questionStart) / 1000);
    const totalTime = Math.floor((now - testStart) / 1000);

    // 🔴 FIX: Save time spent per question
    if (!req.session.questionTimes) req.session.questionTimes = {};
    req.session.questionTimes[questionId] = timeSpent;

    console.log(`⏱️ Time spent on question ${questionId}: ${timeSpent} seconds`);
    console.log(`⏱️ Total test time so far: ${totalTime} seconds`);

    // 👤 Update user activity timestamps
    if (userId) {
      const user = await User.findById(userId).select('lastSeen');
      const updates = { lastActive: new Date() };
      if (!user.lastSeen || new Date() - user.lastSeen > 60 * 1000) updates.lastSeen = new Date();
      await User.findByIdAndUpdate(userId, updates);

      const totalQuestions = await Question.countDocuments({ testId });
      await TestProgress.findOneAndUpdate(
        { userId, testId },
        {
          $set: {
            index: currentIndex,
            total: totalQuestions,
            updatedAt: new Date(),
            status: 'active'
          }
        },
        { upsert: true }
      );
    }
  } catch (err) {
    console.error('❌ Error processing submission:', err);
  }

  // Redirect
  const totalQuestions = await Question.countDocuments({ testId });
  if (currentIndex + 1 >= totalQuestions) {
    return res.redirect(`/submit-test-final/${testId}`);
  }

  return res.redirect(`/start-test/${testId}?index=${index}&selected=${answer}&feedback=true`);
});


// ✅ Middleware to ensure user is logged in
function requireLogin(req, res, next) {
  if (!req.session.userId) {
    console.log('🔒 No session found — redirecting to /login');
    return res.redirect('/login');
  }
  console.log('✅ User session:', req.session.userId);
  next();
}


app.get('/test-center', requireLogin, async (req, res) => {
  const userName = req.session.userName || 'User';
  const tests = await Test.find().sort({ createdAt: -1 });
  const now = new Date();

  function formatRemainingTime(createdAt, limitMinutes) {
    const end = new Date(createdAt.getTime() + (limitMinutes || 60) * 60000);
    const ms = end - now;
    if (ms <= 0) return '⏳ expired';

    const mins = Math.floor(ms / 60000);
    const hrs = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);
    const remaining = [];

    if (days > 0) remaining.push(`${days}d`);
    if (hrs % 24 > 0) remaining.push(`${hrs % 24}h`);
    if (mins % 60 > 0) remaining.push(`${mins % 60}m`);

    return `⏳ ${remaining.join(' ')} left`;
  }

  const rows = tests.map(t => {
    const percentage = Math.floor(Math.random() * 100);
    const remaining = formatRemainingTime(t.createdAt, t.timeLimit);
    const isActive = t.isActive !== false;

    return `
      <tr>
        <td>
          <strong>${t.title}</strong><br>
          <span class="desc">${t.description || '— No description —'}</span>
        </td>
        <td>${t.createdAt.toISOString().split('T')[0]}</td>
        <td>—</td>
        <td>
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${percentage}%;"></div>
          </div>
          <div class="small-text">${percentage}% used · ${remaining}</div>
        </td>
        <td style="text-align: right;">
          <form action="/start-test/${t._id}" method="GET">
            <button title="${isActive ? 'Start Test' : 'Disabled by Admin'}"
              class="start-btn" ${!isActive ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
              ▶️ ${isActive ? 'Start' : 'Locked'}
            </button>
          </form>
        </td>
      </tr>
    `;
  }).join('');

  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Radiography Assistant – Test Center</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; display: flex; background: #f8f9fb; }
    .sidebar {
      width: 220px; background: #ffffff; padding: 20px; height: 100vh;
      display: flex; flex-direction: column; justify-content: space-between;
      border-right: 1px solid #ddd;
    }
    .sidebar h2 { font-size: 18px; color: #0f1f3e; margin-bottom: 20px; }
    .logout-form { margin-top: auto; }
    .logout-form button {
      background: #d9534f; color: white; border: none; border-radius: 6px;
      padding: 8px 16px; font-weight: bold; cursor: pointer;
    }
    .logout-form button:hover { background: #c9302c; }

    .main {
      flex: 1; padding: 40px; background: #ffffff; position: relative;
    }
    .user-info {
      position: absolute; top: 20px; right: 30px;
      font-size: 14px; color: #0f1f3e; font-weight: bold;
    }
    .card {
      background: #0f1f3e; color: white; padding: 20px;
      border-radius: 12px; margin-bottom: 30px;
    }
    h2 { margin-bottom: 20px; color: #0f1f3e; }
    table {
      width: 100%; border-collapse: collapse; background: #fff;
      border-radius: 10px; overflow: hidden;
      box-shadow: 0 2px 6px rgba(0,0,0,0.05);
    }
    th, td {
      padding: 14px 16px; text-align: left; border-bottom: 1px solid #f0f0f0;
      vertical-align: top; font-size: 14px;
    }
    th {
      background: #f8fafc; color: #333;
      text-transform: uppercase; font-size: 12px;
    }
    tr:hover { background-color: #f9fbff; }
    .progress-bar {
      width: 100px; background: #e0e0e0;
      border-radius: 4px; overflow: hidden;
    }
    .progress-fill { height: 10px; background: #007bff; }
    .small-text { font-size: 11px; color: #555; }
    .start-btn {
      background: #007bff; border: none;
      font-size: 14px; padding: 6px 12px;
      border-radius: 6px; color: white; cursor: pointer; font-weight: bold;
    }
    .start-btn:hover { background: #0056b3; }
    .desc { font-size: 12px; color: #777; }

    @media (max-width: 768px) {
      .main { padding: 20px; }
      table, thead, tbody, th, td, tr { display: block; }
      th, td { padding: 10px; }
    }
  </style>
</head>
<body>
  <div class="sidebar">
    <div>
      <h2>🩻 Radiography</h2>
    </div>
    <form class="logout-form" action="/logout" method="POST">
      <button type="submit">🚪 Logout</button>
    </form>
  </div>

  <div class="main">
    <div class="user-info">👤 ${userName}</div>
    <div class="card">
      <h3>Welcome to the Weekly Radiography Exam Center</h3>
      <p>
        ✅ Practice tests based on clinical imaging routines<br>
        ✅ Reinforce your anatomy, positioning, and critique skills<br>
        ✅ Monitor your performance and improve each week
      </p>
    </div>

    <h2>📋 Available Tests</h2>
    <table>
      <thead>
        <tr>
          <th>Test</th>
          <th>Date</th>
          <th>Positioning</th>
          <th>Technique</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </div>
</body>
</html>
  `);
});


app.get('/admin/tests', async (req, res) => {
  console.log('📥 GET /admin/tests - Admin viewing test list');

  const tests = await Test.find().sort({ createdAt: -1 });

  const rows = tests.map(t => `
    <tr>
      <td>
        <strong>${t.title}</strong><br>
        <span style="font-size: 12px; color: #777;">${t.description || 'No description'}</span>
      </td>
      <td>
        ${new Date(t.createdAt).toISOString().split('T')[0]}<br>
        <span style="font-size: 11px; color: #666;">
          🗓 ${t.startDate ? new Date(t.startDate).toLocaleString() : '—'} → 
          ${t.endDate ? new Date(t.endDate).toLocaleString() : '∞'}
        </span>
      </td>
      <td>${t.category || '—'}</td>
      <td>
        <div style="width: 100px; background: #e0e0e0; border-radius: 4px; overflow: hidden;">
          <div style="width: ${t.timeLimit || 60}%; background: #007bff; height: 10px;"></div>
        </div>
        <div style="font-size: 11px; color: #555;">
          ${t.timeLimit || 60}% duration
        </div>
      </td>
      <td style="text-align: right;">
        <form action="/admin/toggle-test/${t._id}" method="POST" style="display:inline; margin-right: 10px;">
          <label style="position: relative; display: inline-block; width: 46px; height: 24px;">
            <input type="checkbox" name="toggle" onchange="this.form.submit()" ${t.isActive ? 'checked' : ''} style="opacity:0;width:0;height:0;">
            <span style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: ${t.isActive ? '#28a745' : '#ccc'}; border-radius: 24px; transition: .4s;">
              <span style="position: absolute; content: ''; height: 18px; width: 18px; left: ${t.isActive ? '24px' : '4px'}; bottom: 3px; background-color: white; border-radius: 50%; transition: .4s;"></span>
            </span>
          </label>
        </form>
        <form action="/admin/update-access/${t._id}" method="POST" onsubmit="return validateForm(this)" style="display:inline-block;">
          <select name="accessType" onchange="handleAccessChange(this)" style="font-size: 13px; padding: 3px 6px;">
            <option value="infinite" ${t.isOpenAccess ? 'selected' : ''}>Infinite</option>
            <option value="limited" ${!t.isOpenAccess ? 'selected' : ''}>Limited</option>
          </select>
          <input type="number" name="maxUsers" value="${t.maxUsers || 0}" placeholder="Max users"
            style="width: 60px; padding: 3px 5px; font-size: 13px; margin-left: 5px;"
            ${t.isOpenAccess ? 'disabled' : ''}>
          <button type="submit" style="font-size: 12px; padding: 4px 8px; margin-left: 5px;">Update</button>
        </form>
      </td>
    </tr>
  `).join('');

  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Radiography Assistant – Tests</title>
  <style>
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      display: flex;
      background: #f8f9fb;
    }
    .sidebar {
      width: 220px;
      background: #ffffff;
      padding: 20px;
      height: 100vh;
      border-right: 1px solid #ddd;
    }
    .sidebar h2 {
      font-size: 18px;
      margin-bottom: 20px;
      color: #0f1f3e;
    }
    .sidebar nav {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .sidebar nav a {
      text-decoration: none;
      color: #0f1f3e;
      font-size: 14px;
    }
    .sidebar nav a:hover {
      text-decoration: underline;
    }
    .main {
      flex: 1;
      padding: 40px;
      background: #ffffff;
    }
    .card {
      background: #0f1f3e;
      color: white;
      padding: 20px;
      border-radius: 12px;
      margin-bottom: 30px;
    }
    .card h3 {
      margin-top: 0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 20px;
    }
    th, td {
      padding: 12px 10px;
      text-align: left;
      border-bottom: 1px solid #e0e0e0;
      vertical-align: top;
      font-size: 14px;
    }
    th {
      background: #f4f4f4;
    }
    button:hover {
      color: #0056b3;
    }
  </style>
  <script>
    function handleAccessChange(select) {
      const input = select.form.querySelector('input[name="maxUsers"]');
      input.disabled = (select.value === 'infinite');
    }
    function validateForm(form) {
      const type = form.accessType.value;
      const max = form.maxUsers.value;
      if (type === 'limited' && (!max || max <= 0)) {
        alert('Please enter a valid number of users.');
        return false;
      }
      return true;
    }
  </script>
</head>
<body>
  <div class="sidebar">
    <h2>🩻 Radiography</h2>
    <nav>
      <a href="/admin/tests">📋 Manage Tests</a>
      <a href="/admin/create-test">➕ Create Test</a>
      <a href="/admin/questions">🧠 Manage Questions</a>
      <a href="/upload-form">📤 Upload Excel</a>
    </nav>
  </div>
  <div class="main">
    <div class="card">
      <h3>Welcome to the Weekly Radiography Exam Center</h3>
      <p>
        ✅ Manage test availability window<br>
        ✅ Limit student access count or keep open<br>
        ✅ Toggle test on/off visibility
      </p>
    </div>
    <h2>Admin – Manage Test Access</h2>
    <table>
      <thead>
        <tr>
          <th>Test</th>
          <th>Date / Window</th>
          <th>Category</th>
          <th>Settings</th>
          <th>Access</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </div>
</body>
</html>
  `);
});




// ✅ Enhanced POST: Update access settings for a test (Infinite or Limited)
app.post('/admin/update-access/:id', async (req, res) => {
  const { id } = req.params;
  const { accessType, maxUsers } = req.body;

  try {
    const test = await Test.findById(id);
    if (!test) {
      console.warn(`⚠️ Test not found: ${id}`);
      return res.status(404).send('Test not found');
    }

    if (accessType === 'infinite') {
      test.isOpenAccess = true;
      test.maxUsers = 0;
      console.log(`🔁 Updated: Test "${test.title}" set to Infinite Access`);
    } else if (accessType === 'limited') {
      const parsedUsers = parseInt(maxUsers, 10);
      if (isNaN(parsedUsers) || parsedUsers < 1) {
        console.warn(`⚠️ Invalid maxUsers: "${maxUsers}"`);
        return res.status(400).send('Please enter a valid number of users.');
      }
      test.isOpenAccess = false;
      test.maxUsers = parsedUsers;
      console.log(`🔁 Updated: Test "${test.title}" limited to ${parsedUsers} users`);
    } else {
      console.warn(`⚠️ Invalid accessType: "${accessType}"`);
      return res.status(400).send('Invalid access type.');
    }

    await test.save();
    res.redirect('/admin/tests');
  } catch (err) {
    console.error('❌ Failed to update test access settings:', err);
    res.status(500).send('Internal server error');
  }
});



app.post('/admin/toggle-test/:id', async (req, res) => {
  const testId = req.params.id;
  console.log(`📥 Received POST to toggle test with ID: ${testId}`);

  try {
    const test = await Test.findById(testId);
    if (!test) {
      console.log(`❌ No test found for ID: ${testId}`);
      return res.status(404).send('❌ Test not found');
    }

    const originalStatus = test.isActive;
    test.isActive = !test.isActive;
    test.updatedAt = new Date();

    await test.save();

    console.log(`🔁 Test "${test.title}" (ID: ${testId}) toggled from ${originalStatus ? '✅ Active' : '🚫 Blocked'} → ${test.isActive ? '✅ Active' : '🚫 Blocked'}`);
    console.log(`🕒 Updated at: ${test.updatedAt.toISOString()}`);

    res.redirect('/admin/tests');
  } catch (err) {
    console.error('❌ Error toggling test access:', err);
    res.status(500).send('Internal Server Error');
  }
});


app.get('/admin/create-test', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Create New Test</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background: #f8f9fb;
      margin: 0;
      display: flex;
    }

    .sidebar {
      width: 220px;
      background: #ffffff;
      padding: 20px;
      height: 100vh;
      border-right: 1px solid #ddd;
    }

    .sidebar h2 {
      font-size: 18px;
      color: #0f1f3e;
      margin-bottom: 20px;
    }

    .sidebar nav {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .sidebar nav a {
      text-decoration: none;
      color: #0f1f3e;
      font-size: 14px;
    }

    .sidebar nav a:hover {
      text-decoration: underline;
    }

    .main {
      flex: 1;
      padding: 40px;
      background: #ffffff;
    }

    .card {
      background: #0f1f3e;
      color: white;
      padding: 20px;
      border-radius: 12px;
      margin-bottom: 30px;
    }

    h3 {
      margin-top: 0;
    }

    form {
      background: #fff;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.05);
      max-width: 550px;
    }

    label {
      font-weight: bold;
      color: #333;
      display: block;
      margin-top: 15px;
    }

    input, textarea, select {
      width: 100%;
      padding: 10px;
      font-size: 14px;
      margin-top: 8px;
      border: 1px solid #ccc;
      border-radius: 6px;
    }

    button {
      margin-top: 20px;
      padding: 10px 20px;
      font-size: 14px;
      background: #007bff;
      color: white;
      border: none;
      border-radius: 6px;
      font-weight: bold;
      cursor: pointer;
    }

    button:hover {
      background: #0056b3;
    }
  </style>
</head>
<body>
  <div class="sidebar">
    <h2>🩻 Radiography</h2>
    <nav>
      <a href="/admin/tests">📋 Manage Tests</a>
      <a href="/admin/create-test">➕ Create Test</a>
      <a href="/admin/questions">🧠 Manage Questions</a>
      <a href="/upload-form">📤 Upload Excel</a>
    </nav>
  </div>

  <div class="main">
    <div class="card">
      <h3>➕ Create New Test</h3>
      <form method="POST" action="/admin/create-test">
        <label>Test Title:</label>
        <input type="text" name="title" required />

        <label>Description:</label>
        <textarea name="description" rows="3"></textarea>

        <label>Time Limit (minutes):</label>
        <input type="number" name="timeLimit" min="1" />

        <label>Start Date (optional):</label>
        <input type="datetime-local" name="startDate" />

        <label>End Date (optional):</label>
        <input type="datetime-local" name="endDate" />

        <label>Max Users Allowed:</label>
        <input type="number" name="maxUsers" min="0" placeholder="0 = unlimited" />

        <label>Open Access (ignore max user limit):</label>
        <select name="isOpenAccess">
          <option value="true" selected>Yes</option>
          <option value="false">No</option>
        </select>

        <button type="submit">✅ Create Test</button>
      </form>
    </div>
  </div>
</body>
</html>
  `);
});



app.post('/admin/create-test', async (req, res) => {
  const { title, description, timeLimit } = req.body;

  const newTest = new Test({
    title,
    description,
    timeLimit: Number(timeLimit)
  });

  await newTest.save();

  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Test Created</title>
  <style>
    body { font-family: Arial; background: #f8f9fb; margin: 0; display: flex; }
    .sidebar { width: 220px; background: #fff; padding: 20px; height: 100vh; border-right: 1px solid #ddd; }
    .main { flex: 1; padding: 40px; background: #fff; }
    .card { background: #0f1f3e; color: #fff; padding: 20px; border-radius: 12px; }
    a {
      display: inline-block; margin-top: 20px;
      padding: 10px 20px; background: #007bff;
      color: white; text-decoration: none; border-radius: 6px;
    }
    a:hover { background: #0056b3; }
  </style>
</head>
<body>
  <div class="sidebar"><h2>🩻 Radiography</h2></div>
  <div class="main">
    <div class="card">
      <h3>✅ Test Created</h3>
      <p><strong>${title}</strong> has been successfully added.</p>
      <a href="/admin/create-test">➕ Create Another</a>
      <a href="/admin/questions" style="margin-left: 10px;">⬅ Back to Questions</a>
    </div>
  </div>
</body>
</html>
  `);
});



app.get('/admin/users', async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 });

  const rows = users.map(user => `
    <tr>
      <td>
        <strong>${user.name}</strong><br>
        <span style="font-size: 12px; color: #777;">${user.email}</span>
      </td>
      <td>${new Date(user.createdAt).toISOString().split('T')[0]}</td>
      <td style="color: ${user.isActive ? '#28a745' : '#dc3545'};">
        ${user.isActive ? '✔️ Active' : '🚫 Inactive'}
      </td>
      <td style="text-align:right;">
        <form action="/admin/toggle-user/${user._id}" method="POST" style="display:inline;">
          <button class="btn-toggle" type="submit">${user.isActive ? 'Disable' : 'Enable'}</button>
        </form>
        <form action="/admin/delete-user/${user._id}" method="POST" style="display:inline;" onsubmit="return confirm('Delete this user?');">
          <button class="btn-delete" type="submit">🗑️</button>
        </form>
      </td>
    </tr>
  `).join('');

  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Radiography Assistant – Manage Users</title>
  <style>
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: #f8f9fb;
      display: flex;
    }

    .sidebar {
      width: 220px;
      background: #ffffff;
      padding: 20px;
      height: 100vh;
      border-right: 1px solid #ddd;
    }

    .sidebar h2 {
      font-size: 18px;
      color: #0f1f3e;
      margin-bottom: 20px;
    }

    .sidebar nav {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .sidebar nav a {
      text-decoration: none;
      color: #0f1f3e;
      font-size: 14px;
    }

    .sidebar nav a:hover {
      text-decoration: underline;
    }

    .main {
      flex: 1;
      padding: 40px;
      background: #ffffff;
    }

    .card {
      background: #0f1f3e;
      color: white;
      padding: 20px;
      border-radius: 12px;
      margin-bottom: 30px;
    }

    h2 {
      color: #0f1f3e;
      margin-top: 0;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      background: #fff;
      box-shadow: 0 2px 6px rgba(0,0,0,0.05);
    }

    th, td {
      padding: 12px 14px;
      font-size: 14px;
      border-bottom: 1px solid #eee;
      text-align: left;
    }

    th {
      background: #f4f4f4;
      text-transform: uppercase;
      font-size: 12px;
    }

    .btn-toggle {
      padding: 5px 10px;
      background: #ffc107;
      color: black;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      margin-right: 6px;
    }

    .btn-delete {
      padding: 5px 10px;
      background: #dc3545;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }

    .btn-toggle:hover { background: #e0a800; }
    .btn-delete:hover { background: #c82333; }
  </style>
</head>
<body>
  <div class="sidebar">
    <h2>🩻 Radiography</h2>
    <nav>
      <a href="/admin/tests">📋 Manage Tests</a>
      <a href="/admin/create-test">➕ Create Test</a>
      <a href="/admin/questions">🧠 Manage Questions</a>
      <a href="/upload-form">📤 Upload Excel</a>
      <a href="/admin/users">👥 Manage Users</a>
    </nav>
  </div>

  <div class="main">
    <div class="card">
      <h3>👥 User Management Panel</h3>
      <p>
        ✅ View all registered users<br>
        ✅ Toggle active status or permanently delete accounts
      </p>
    </div>

    <h2>Registered Users</h2>
    <table>
      <thead>
        <tr>
          <th>User</th>
          <th>Joined</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </div>
</body>
</html>
  `);
});



app.post('/admin/toggle-user/:id', async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).send('User not found');

  user.isActive = !user.isActive;
  await user.save();

  res.redirect('/admin/users');
});










//////question managment code ////////////
app.get('/upload-form', async (req, res) => {
  const tests = await Test.find().sort({ title: 1 });

  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Upload Questions</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background: #f8f9fb;
      margin: 0;
      display: flex;
    }

    .sidebar {
      width: 220px;
      background: #ffffff;
      padding: 20px;
      height: 100vh;
      border-right: 1px solid #ddd;
    }

    .sidebar h2 {
      font-size: 18px;
      color: #0f1f3e;
      margin-bottom: 20px;
    }

    .sidebar nav {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .sidebar nav a {
      text-decoration: none;
      color: #0f1f3e;
      font-size: 14px;
    }

    .sidebar nav a:hover {
      text-decoration: underline;
    }

    .main {
      flex: 1;
      padding: 40px;
      background: #ffffff;
    }

    .card {
      background: #0f1f3e;
      color: white;
      padding: 20px;
      border-radius: 12px;
      margin-bottom: 30px;
    }

    .card h3 {
      margin-top: 0;
    }

    h2 {
      color: #0f1f3e;
      margin-bottom: 20px;
    }

    form {
      background: #ffffff;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.05);
      max-width: 500px;
    }

    label {
      font-weight: bold;
      display: block;
      margin-top: 15px;
      color: #333;
    }

    select, input[type="file"] {
      margin-top: 8px;
      width: 100%;
      padding: 10px;
      font-size: 14px;
      border: 1px solid #ccc;
      border-radius: 6px;
    }

    button {
      margin-top: 20px;
      padding: 10px 20px;
      background: #007bff;
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: bold;
      cursor: pointer;
    }

    button:hover {
      background: #0056b3;
    }
  </style>
</head>
<body>
  <div class="sidebar">
    <h2>🩻 Radiography</h2>
    <nav>
      <a href="/admin/tests">📋 Manage Tests</a>
      <a href="/admin/create-test">➕ Create Test</a>
      <a href="/admin/questions">🧠 Manage Questions</a>
      <a href="/upload-form">📤 Upload Excel</a>
    </nav>
  </div>

  <div class="main">
    <div class="card">
      <h3>📤 Upload Questions</h3>
      <p>Import .xlsx files to quickly add multiple questions to your test library.</p>
    </div>

    <h2>Upload Questions (.xlsx)</h2>
    <form action="/upload-question" method="POST" enctype="multipart/form-data">
      <label>Select Test:</label>
      <select name="testId" required>
        ${tests.map(t => `<option value="${t._id}">${t.title}</option>`).join('')}
      </select>

      <label>Upload Excel File:</label>
      <input type="file" name="xlsxFile" accept=".xlsx" required />

      <button type="submit">📥 Upload</button>
    </form>
  </div>
</body>
</html>`);
});



app.post('/upload-question', upload.single('xlsxFile'), async (req, res) => {
  const { testId } = req.body;
  const workbook = xlsx.readFile(req.file.path);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet);

  const bulk = data.map(row => {
    const choices = [row.A, row.B, row.C, row.D];

    return {
      title: row.Question,
      choices,
      correctAnswer: row['Correct Answer'],
      category: row.Category || 'General',
      testId,
      assignedAt: new Date(),
      choiceCounts: Array(choices.length).fill(0) // ✅ Initialize vote counts
    };
  });

  await Question.insertMany(bulk);

  res.send(`<p>✅ Questions uploaded with vote tracking initialized. <a href="/upload-form">Upload More</a></p>`);
});




// ✅ 5️⃣ Delete Question
app.post('/delete-question/:id', async (req, res) => {
  await Question.findByIdAndDelete(req.params.id);

  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Question Deleted</title>
  <style>
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      display: flex;
      background: #f8f9fb;
    }
    .sidebar {
      width: 220px;
      background: #ffffff;
      padding: 20px;
      height: 100vh;
      border-right: 1px solid #ddd;
    }
    .main {
      flex: 1;
      padding: 40px;
      background: #ffffff;
    }
    .card {
      background: #0f1f3e;
      color: white;
      padding: 20px;
      border-radius: 12px;
      margin-bottom: 30px;
    }
    .card h3 {
      margin-top: 0;
    }
    a {
      display: inline-block;
      margin-top: 20px;
      padding: 10px 20px;
      background: #dc3545;
      color: white;
      text-decoration: none;
      border-radius: 6px;
    }
    a:hover {
      background: #a71d2a;
    }
  </style>
</head>
<body>
  <div class="sidebar">
    <h2>🩻 Radiography</h2>
  </div>
  <div class="main">
    <div class="card">
      <h3>🗑️ Question Deleted</h3>
      <p>The question has been permanently removed from the system.</p>
      <a href="/admin/questions">⬅️ Back to Question List</a>
    </div>
  </div>
</body>
</html>
  `);
});

app.get('/admin/questions', async (req, res) => {
  const questions = await Question.find().populate('testId').sort({ createdAt: -1 });

  const rows = questions.map(q => `
    <tr>
      <td>${q.title}</td>
      <td>${q.correctAnswer}</td>
      <td>${q.category}</td>
      <td>
        ${q.testId ? `<strong>${q.testId.title}</strong><br>` : '<em>— Not Assigned —</em>'}
        ${q.assignedAt ? `<small>📅 ${new Date(q.assignedAt).toLocaleDateString()}</small>` : ''}
      </td>
      <td>
        <a class="btn-edit" href="/edit-question-detail/${q._id}">✏️ Edit</a>
        <form method="POST" action="/delete-question/${q._id}" style="display:inline;" onsubmit="return confirm('Delete this question?')">
          <button class="btn-delete" type="submit">🗑️ Delete</button>
        </form>
      </td>
    </tr>
  `).join('');

  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>📊 Question Management</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 30px;
      background: #f0f4f8;
    }
    h2 {
      color: #0f1f3e;
      margin-bottom: 20px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: #ffffff;
      box-shadow: 0 0 8px rgba(0,0,0,0.05);
    }
    th {
      background: #0f1f3e;
      color: #ffffff;
      padding: 12px;
      text-align: left;
      font-size: 14px;
      text-transform: uppercase;
    }
    td {
      padding: 12px;
      font-size: 15px;
      vertical-align: top;
      border-bottom: 1px solid #eee;
    }
    tr:hover {
      background-color: #f9fbff;
    }
    .btn-edit, .btn-delete {
      text-decoration: none;
      font-size: 14px;
      padding: 6px 12px;
      border-radius: 5px;
      margin-right: 5px;
      border: none;
      cursor: pointer;
    }
    .btn-edit {
      background-color: #007bff;
      color: white;
    }
    .btn-edit:hover {
      background-color: #0056b3;
    }
    .btn-delete {
      background-color: #dc3545;
      color: white;
    }
    .btn-delete:hover {
      background-color: #a71d2a;
    }
    form {
      display: inline;
    }
  </style>
</head>
<body>
  <h2>📊 Question Management</h2>
  <table>
    <thead>
      <tr>
        <th>Question</th>
        <th>Correct</th>
        <th>Category</th>
        <th>Test Assigned</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</body>
</html>
  `);
});

app.get('/edit-question-detail/:id', async (req, res) => {
  const questionId = req.params.id;
  const question = await Question.findById(questionId);
  const tests = await Test.find().sort({ title: 1 });

  // Extract choices and explanations, with fallbacks for empty
  const [a, b, c, d] = question.choices || ['', '', '', ''];
  const [expA, expB, expC, expD] = question.optionExplanations || ['', '', '', ''];
  const [countA, countB, countC, countD] = question.choiceCounts || [0, 0, 0, 0];

  const testOptions = tests.map(t => `
    <option value="${t._id}" ${question.testId && question.testId.toString() === t._id.toString() ? 'selected' : ''}>
      ${t.title}
    </option>
  `).join('');

  const imagePreviewHTML = (question.imageUrls || []).map((url, i) => {
    const label = question.imageLabels?.[i] || `Image ${i + 1}`;
    return `
      <div class="preview">
        <strong>${label}:</strong><br>
        <img src="/uploads/${url}" style="max-width: 300px; margin-bottom: 10px;" />
      </div>
    `;
  }).join('');

  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Edit Question</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; display: flex; background: #f8f9fb; }
    .sidebar { width: 220px; background: #fff; padding: 20px; height: 100vh; border-right: 1px solid #ddd; }
    .main { flex: 1; padding: 40px; background: #fff; }
    .card { background: #0f1f3e; color: white; padding: 20px; border-radius: 12px; margin-bottom: 30px; }
    label { display: block; margin-top: 10px; font-weight: bold; color: #333; }
    input[type="text"], input[type="number"], textarea, select, input[type="file"] {
      width: 100%; padding: 8px; font-size: 14px; margin-top: 5px; border: 1px solid #ccc; border-radius: 6px;
    }
    textarea { min-height: 34px; }
    button { margin-top: 25px; padding: 12px 24px; font-size: 16px; font-weight: bold; background: #28a745; color: white; border: none; border-radius: 6px; cursor: pointer; }
    button:hover { background: #218838; }
    img { margin-top: 10px; border: 1px solid #ccc; border-radius: 6px; }
    .form-section { margin-bottom: 20px; }
    .option-block { background: #f5f6fa; padding: 16px 14px 10px 14px; border-radius: 8px; margin-bottom: 12px; }
    .option-block label:first-child { font-size: 15px; }
  </style>
</head>
<body>
  <div class="sidebar">
    <h2>🩻 Radiography</h2>
    <nav>
      <a href="/admin/tests">📋 Manage Tests</a>
      <a href="/admin/create-test">➕ Create Test</a>
      <a href="/admin/questions">🧠 Manage Questions</a>
      <a href="/upload-form">📤 Upload Excel</a>
    </nav>
  </div>

  <div class="main">
    <div class="card">
      <h3>✏️ Edit Question</h3>
    </div>

    <form action="/update-question-detail/${question._id}" method="POST" enctype="multipart/form-data">

      <div class="form-section">
        <label for="title">Question Text:</label>
        <textarea name="title" rows="3" required>${question.title}</textarea>
      </div>

      <!-- Option blocks: Each has answer and explanation mapped together -->
      <div class="form-section">
        <div class="option-block">
          <label>Option A:</label>
          <input type="text" name="a" value="${a}" required>
          <label style="font-weight:400;color:#555;">Explanation for Option A:</label>
          <textarea name="explainA" rows="2" placeholder="Explanation for Option A...">${expA}</textarea>
        </div>
        <div class="option-block">
          <label>Option B:</label>
          <input type="text" name="b" value="${b}" required>
          <label style="font-weight:400;color:#555;">Explanation for Option B:</label>
          <textarea name="explainB" rows="2" placeholder="Explanation for Option B...">${expB}</textarea>
        </div>
        <div class="option-block">
          <label>Option C:</label>
          <input type="text" name="c" value="${c}" required>
          <label style="font-weight:400;color:#555;">Explanation for Option C:</label>
          <textarea name="explainC" rows="2" placeholder="Explanation for Option C...">${expC}</textarea>
        </div>
        <div class="option-block">
          <label>Option D:</label>
          <input type="text" name="d" value="${d}" required>
          <label style="font-weight:400;color:#555;">Explanation for Option D:</label>
          <textarea name="explainD" rows="2" placeholder="Explanation for Option D...">${expD}</textarea>
        </div>
      </div>

      <div class="form-section">
        <label>Correct Answer:</label>
        <select name="correctAnswer" required>
          <option value="A" ${question.correctAnswer === 'A' ? 'selected' : ''}>A</option>
          <option value="B" ${question.correctAnswer === 'B' ? 'selected' : ''}>B</option>
          <option value="C" ${question.correctAnswer === 'C' ? 'selected' : ''}>C</option>
          <option value="D" ${question.correctAnswer === 'D' ? 'selected' : ''}>D</option>
        </select>
      </div>

      <div class="form-section">
        <label>Assign to Test:</label>
        <select name="testId" required>
          <option value="">— Select Test —</option>
          ${testOptions}
        </select>
      </div>

      <div class="form-section">
        <label>General Explanation:</label>
        <textarea name="explanation" rows="4">${question.explanation || ''}</textarea>
      </div>

      <div class="form-section">
        <label>Choice Counts (Votes per Option):</label>
        <label>A Votes:</label><input type="number" name="countA" value="${countA}" min="0">
        <label>B Votes:</label><input type="number" name="countB" value="${countB}" min="0">
        <label>C Votes:</label><input type="number" name="countC" value="${countC}" min="0">
        <label>D Votes:</label><input type="number" name="countD" value="${countD}" min="0">
      </div>

      <div class="form-section">
        <label>Upload Reference Images:</label>
        <input type="file" name="referenceImages" accept="image/*" multiple />
        <label>Upload Explanation Images:</label>
        <input type="file" name="explanationImages" accept="image/*" multiple />
        <label>Image Labels (comma-separated):</label>
        <input type="text" name="imageLabels" value="${(question.imageLabels || []).join(', ')}" />
        ${imagePreviewHTML}
      </div>

      <button type="submit">💾 Save Changes</button>
    </form>
  </div>
</body>
</html>
  `);
});


app.post('/update-question-detail/:id', uploadMultiple, async (req, res) => {
  try {
    const questionId = req.params.id;
    const question = await Question.findById(questionId);
    if (!question) return res.status(404).send('❌ Question not found');

    // ✅ Extract form fields (including explanations for each option)
    const {
      title, a, b, c, d,
      explainA, explainB, explainC, explainD,
      correctAnswer, testId, explanation,
      countA, countB, countC, countD,
      imageLabels
    } = req.body;

    // ✅ Update basic fields
    question.title = title;
    question.choices = [a, b, c, d];
    question.optionExplanations = [explainA, explainB, explainC, explainD];
    question.correctAnswer = correctAnswer;
    question.testId = testId;
    question.explanation = explanation;
    question.choiceCounts = [
      parseInt(countA) || 0,
      parseInt(countB) || 0,
      parseInt(countC) || 0,
      parseInt(countD) || 0
    ];

    // ✅ Parse and store image labels
    const labelArray = imageLabels ? imageLabels.split(',').map(label => label.trim()) : [];

    // ✅ Handle uploaded files
    const referenceFiles = req.files['referenceImages'] || [];
    const explanationFiles = req.files['explanationImages'] || [];

    // Combine new image URLs
    const newImageUrls = [...referenceFiles, ...explanationFiles].map(f => f.filename);
    question.imageUrls.push(...newImageUrls);

    // Match new labels to uploaded files (or use default if not enough labels)
    const newLabels = labelArray.length >= newImageUrls.length
      ? labelArray.slice(0, newImageUrls.length)
      : newImageUrls.map((_, i) => labelArray[i] || `Image ${i + 1}`);

    question.imageLabels.push(...newLabels);

    await question.save();

    res.send(`<h2>✅ Question updated successfully. <a href="/edit-question-detail/${questionId}">Go back</a></h2>`);
  } catch (err) {
    console.error('❌ Error updating question:', err);
    res.status(500).send('Internal Server Error');
  }
});


// ✅ Route: /admin/dashboard – main admin dashboard
app.get('/admin/dashboard', async (req, res) => {
  const [userCount, testCount, questionCount] = await Promise.all([
    User.countDocuments(),
    Test.countDocuments(),
    Question.countDocuments(),
  ]);

  const results = await Result.find().populate('userId');
  const attemptCount = results.length;
  const totalScore = results.reduce((sum, r) => sum + r.score, 0);
  const averageScore = attemptCount ? (totalScore / attemptCount).toFixed(1) : 'N/A';

  const userScores = {};
  results.forEach(r => {
    const name = r.userId?.name || 'Unknown';
    if (!userScores[name]) userScores[name] = { total: 0, count: 0 };
    userScores[name].total += r.score;
    userScores[name].count++;
  });

  const topUsers = Object.entries(userScores)
    .map(([name, data]) => ({ name, avg: (data.total / data.count).toFixed(1) }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 5);

  const topList = topUsers.map(u => `<li>${u.name}: ${u.avg}</li>`).join('');

  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Admin Dashboard</title>
  <style>
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: #f8f9fb;
      display: flex;
    }
    .sidebar {
      width: 220px;
      background: #ffffff;
      padding: 20px;
      height: 100vh;
      border-right: 1px solid #ddd;
    }
    .sidebar h2 {
      font-size: 18px;
      margin-bottom: 20px;
      color: #0f1f3e;
    }
    .sidebar nav {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .sidebar nav .section-title {
      margin-top: 15px;
      margin-bottom: 6px;
      font-size: 13px;
      font-weight: bold;
      color: #666;
      text-transform: uppercase;
      border-bottom: 1px solid #ddd;
      padding-bottom: 4px;
    }
    .sidebar nav a {
      text-decoration: none;
      color: #0f1f3e;
      font-size: 14px;
      padding-left: 10px;
    }
    .sidebar nav a:hover {
      text-decoration: underline;
    }
    .main {
      flex: 1;
      padding: 40px;
      background: #ffffff;
    }
    .card {
      background: #0f1f3e;
      color: white;
      padding: 20px;
      border-radius: 12px;
      margin-bottom: 30px;
    }
    .card h3 {
      margin-top: 0;
    }
    .actions {
      margin-bottom: 30px;
      display: flex;
      gap: 15px;
      flex-wrap: wrap;
    }
    .actions form {
      display: inline;
    }
    .actions button {
      padding: 10px 20px;
      background: #d9534f;
      color: white;
      font-size: 14px;
      font-weight: bold;
      border: none;
      border-radius: 6px;
      cursor: pointer;
    }
    .actions button:hover {
      background: #c9302c;
    }
    .tiles {
      display: flex;
      gap: 20px;
      margin-bottom: 30px;
    }
    .tile {
      background: #f0f2f7;
      border: 1px solid #ddd;
      border-radius: 10px;
      padding: 20px;
      flex: 1;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }
    .tile h2 {
      font-size: 22px;
      color: #0f1f3e;
      margin: 0 0 10px;
    }
    .tile p {
      font-size: 16px;
      color: #444;
    }
    ul {
      margin: 0;
      padding-left: 20px;
      font-size: 14px;
      color: #0f1f3e;
    }
  </style>
</head>
<body>
  <div class="sidebar">
    <h2>🩻 Radiography</h2>
    <nav>
      <div class="section-title">Management</div>
      <a href="/admin/dashboard">📊 Dashboard</a>
      <a href="/admin/tests">📋 Manage Tests</a>
      <a href="/admin/create-test">➕ Create Test</a>
      <a href="/admin/questions">🧠 Manage Questions</a>
      <a href="/upload-form">📤 Upload Excel</a>
      <div class="section-title">Analytics</div>
      <a href="/admin/test-analytics">📈 Test Analytics</a>
      <a href="/admin/user-analytics">👥 User Analytics</a>
      <a href="/admin/question-analytics">❓ Question Analytics</a>
    </nav>
  </div>
  <div class="main">
    <div class="card">
      <h3>📊 Radiography Admin Dashboard</h3>
      <p>Overview of users, questions, tests, and performance metrics.</p>
    </div>

    <div class="actions">
      <form action="/admin/reset-tests" method="POST">
        <button type="submit">🔁 Reset All Tests</button>
      </form>
      <form action="/admin/reset-users" method="POST">
        <button type="submit">👥 Reset All Users</button>
      </form>
      <form action="/admin/reset-analytics" method="POST">
        <button type="submit">🧹 Clear All Analytics</button>
      </form>
    </div>

    <div class="tiles">
      <div class="tile">
        <h2>👥 Users</h2>
        <p>${userCount}</p>
      </div>
      <div class="tile">
        <h2>📋 Tests</h2>
        <p>${testCount}</p>
      </div>
      <div class="tile">
        <h2>❓ Questions</h2>
        <p>${questionCount}</p>
      </div>
      <div class="tile">
        <h2>📈 Attempts</h2>
        <p>${attemptCount}</p>
      </div>
      <div class="tile">
        <h2>⭐ Avg Score</h2>
        <p>${averageScore}</p>
      </div>
    </div>

    <h3>🏆 Top 5 Performers</h3>
    <ul>${topList}</ul>
  </div>
</body>
</html>
  `);
});


app.post('/admin/reset-tests', async (req, res) => {
  await Test.deleteMany({});
  console.log('🧨 All tests deleted');
  res.redirect('/admin/dashboard');
});


app.post('/admin/reset-users', async (req, res) => {
  await User.deleteMany({});
  console.log('👥 All users deleted');
  res.redirect('/admin/dashboard');
});


app.post('/admin/reset-analytics', async (req, res) => {
  await Result.deleteMany({});
  console.log('📉 All analytics (results) cleared');
  res.redirect('/admin/dashboard');
});


// GET /admin/user-analytics – all users, including those with no tests
app.get('/admin/user-analytics', async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 });
  const results = await Result.find();

  const summaries = users.map(user => {
    const userResults = results.filter(r => r.userId?.toString() === user._id.toString());
    const testsTaken = userResults.length;
    const avgScore = testsTaken > 0
      ? (userResults.reduce((sum, r) => sum + r.score, 0) / testsTaken).toFixed(1)
      : '—';
    const lastAttempt = testsTaken > 0
      ? new Date(Math.max(...userResults.map(r => new Date(r.createdAt))))
      : null;

    return { user, testsTaken, avgScore, lastAttempt };
  });

  const rows = summaries.map(s => `
    <tr>
      <td><a href="/admin/user-analytics/${s.user._id}">${s.user.name}</a></td>
      <td>${s.testsTaken}</td>
      <td>${s.avgScore}</td>
      <td>${s.lastAttempt ? new Date(s.lastAttempt).toLocaleDateString() : '—'}</td>
      <td>${s.user.state || '—'}, ${s.user.country || '—'}</td>
      <td>${s.user.examDate ? new Date(s.user.examDate).toLocaleDateString() : '—'}</td>
    </tr>
  `).join("");

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>User Analytics</title>
      <style>
        body { margin: 0; font-family: Arial; background: #f8f9fb; display: flex; }
        .sidebar {
          width: 220px; background: #fff; padding: 20px; height: 100vh; border-right: 1px solid #ddd;
        }
        .sidebar h2 {
          font-size: 18px; margin-bottom: 20px; color: #0f1f3e;
        }
        .sidebar nav {
          display: flex; flex-direction: column; gap: 8px;
        }
        .sidebar nav .section-title {
          margin-top: 15px; margin-bottom: 6px;
          font-size: 13px; font-weight: bold; color: #666;
          text-transform: uppercase; border-bottom: 1px solid #ddd; padding-bottom: 4px;
        }
        .sidebar nav a {
          text-decoration: none; color: #0f1f3e; font-size: 14px; padding-left: 10px;
        }
        .sidebar nav a:hover {
          text-decoration: underline;
        }
        .main {
          flex: 1; padding: 40px; background: #fff;
        }
        h3 {
          color: #0f1f3e;
        }
        table {
          width: 100%; border-collapse: collapse; background: #fff; margin-top: 20px;
        }
        th, td {
          padding: 10px 12px; text-align: left;
          border-bottom: 1px solid #e0e0e0; font-size: 14px;
        }
        th {
          background: #f4f4f4;
        }
        td a {
          color: #007bff;
          text-decoration: none;
        }
        td a:hover {
          text-decoration: underline;
        }
      </style>
    </head>
    <body>
      <div class="sidebar">
        <h2>🩻 Radiography</h2>
        <nav>
          <div class="section-title">Management</div>
          <a href="/admin/dashboard">📊 Dashboard</a>
          <a href="/admin/tests">📋 Manage Tests</a>
          <a href="/admin/create-test">➕ Create Test</a>
          <a href="/admin/questions">🧠 Manage Questions</a>
          <a href="/upload-form">📤 Upload Excel</a>
          <div class="section-title">Analytics</div>
          <a href="/admin/test-analytics">📈 Test Analytics</a>
          <a href="/admin/user-analytics" style="font-weight: bold;">👥 User Analytics</a>
          <a href="/admin/question-analytics">❓ Question Analytics</a>
        </nav>
      </div>
      <div class="main">
        <h3>👥 User Analytics Overview</h3>
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Tests Taken</th>
              <th>Avg Score</th>
              <th>Last Attempt</th>
              <th>Province / Country</th>
              <th>Exam Date</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </body>
    </html>
  `);
});




app.get('/admin/user-analytics/:id', async (req, res) => {
  const userId = req.params.id;
  const user = await User.findById(userId);
  if (!user) return res.send('<h2>User not found</h2>');

  const attempts = await Result.find({ userId })
    .populate('testId')
    .sort({ createdAt: -1 });

  const rows = attempts.map(a => {
    const totalSeconds = a.timeTaken || 0;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const timeFormatted = `${minutes}m ${seconds}s`;

    return `
      <tr>
        <td>${a.testId?.title || '—'}</td>
        <td>${a.score}</td>
        <td>${a.correctAnswers}/${a.totalQuestions}</td>
        <td>${new Date(a.createdAt).toLocaleString()}</td>
        <td>${timeFormatted}</td>
      </tr>
    `;
  }).join('');

  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${user.name} – Analytics</title>
      <style>
        body { margin: 0; font-family: Arial; background: #f8f9fb; display: flex; }
        .sidebar {
          width: 220px; background: #fff; padding: 20px; height: 100vh; border-right: 1px solid #ddd;
        }
        .sidebar h2 {
          font-size: 18px; margin-bottom: 20px; color: #0f1f3e;
        }
        .sidebar nav {
          display: flex; flex-direction: column; gap: 8px;
        }
        .sidebar nav .section-title {
          margin-top: 15px; margin-bottom: 6px;
          font-size: 13px; font-weight: bold; color: #666;
          text-transform: uppercase; border-bottom: 1px solid #ddd; padding-bottom: 4px;
        }
        .sidebar nav a {
          text-decoration: none; color: #0f1f3e; font-size: 14px; padding-left: 10px;
        }
        .sidebar nav a:hover {
          text-decoration: underline;
        }
        .main {
          flex: 1; padding: 40px; background: #fff;
        }
        h3 {
          color: #0f1f3e;
        }
        table {
          width: 100%; border-collapse: collapse; background: #fff; margin-top: 20px;
        }
        th, td {
          padding: 10px 12px; text-align: left;
          border-bottom: 1px solid #e0e0e0; font-size: 14px;
        }
        th {
          background: #f4f4f4;
        }
      </style>
    </head>
    <body>
      <div class="sidebar">
        <h2>🩻 Radiography</h2>
        <nav>
          <div class="section-title">Analytics</div>
          <a href="/admin/user-analytics">← Back to Users</a>
        </nav>
      </div>
      <div class="main">
        <h3>👤 ${user.name} – Detailed Analytics</h3>
        <table>
          <thead>
            <tr>
              <th>Test</th>
              <th>Score</th>
              <th>Correct</th>
              <th>Date</th>
              <th>Total Time</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </body>
    </html>
  `);
});



// ----------------------- TEST ANALYTICS OVERVIEW ---------------------------
// GET /admin/test-analytics – list of tests with summary metrics
app.get('/admin/test-analytics', async (req, res) => {
  const summaries = await Result.aggregate([
    {
      $group: {
        _id: "$testId",
        attempts: { $sum: 1 },
        avgScore: { $avg: "$score" },
        lastAttempt: { $max: "$createdAt" }
      }
    },
    { $lookup: { from: "tests", localField: "_id", foreignField: "_id", as: "test" } },
    { $unwind: "$test" },
    { $sort: { lastAttempt: -1 } }
  ]);

  const rows = summaries.map(s => `
    <tr>
      <td><a href="/admin/test-analytics/${s.test._id}">${s.test.title}</a></td>
      <td>${s.attempts}</td>
      <td>${s.avgScore.toFixed(1)}</td>
      <td>${new Date(s.lastAttempt).toLocaleDateString()}</td>
    </tr>
  `).join("");

  res.send(`<!DOCTYPE html><html><head><title>Test Analytics</title>
    <style>
      body{margin:0;font-family:Arial;background:#f8f9fb;display:flex}
      .sidebar{width:220px;background:#fff;padding:20px;height:100vh;border-right:1px solid #ddd}
      .sidebar h2{font-size:18px;margin-bottom:20px;color:#0f1f3e}
      .sidebar nav{display:flex;flex-direction:column;gap:8px}
      .sidebar nav .section-title{margin-top:15px;margin-bottom:6px;font-size:13px;font-weight:bold;color:#666;text-transform:uppercase;border-bottom:1px solid #ddd;padding-bottom:4px}
      .sidebar nav a{text-decoration:none;color:#0f1f3e;font-size:14px;padding-left:10px}
      .sidebar nav a:hover{text-decoration:underline}
      .main{flex:1;padding:40px;background:#fff}
      h3{color:#0f1f3e}
      table{width:100%;border-collapse:collapse;background:#fff;margin-top:20px}
      th,td{padding:10px 12px;text-align:left;border-bottom:1px solid #e0e0e0;font-size:14px}
      th{background:#f4f4f4}
    </style></head><body>
      <div class="sidebar">
        <h2>🩻 Radiography</h2>
        <nav>
          <div class="section-title">Management</div>
          <a href="/admin/dashboard">📊 Dashboard</a>
          <a href="/admin/tests">📋 Manage Tests</a>
          <a href="/admin/create-test">➕ Create Test</a>
          <a href="/admin/questions">🧠 Manage Questions</a>
          <a href="/upload-form">📤 Upload Excel</a>
          <div class="section-title">Analytics</div>
          <a href="/admin/test-analytics" style="font-weight:bold;">📈 Test Analytics</a>
          <a href="/admin/user-analytics">👥 User Analytics</a>
          <a href="/admin/question-analytics">❓ Question Analytics</a>
        </nav>
      </div>
      <div class="main">
        <h3>📈 Test Analytics Overview</h3>
        <table>
          <thead><tr><th>Test</th><th>Attempts</th><th>Avg Score</th><th>Last Attempt</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </body></html>`);
});


// ✅ Route: /admin/test-analytics/:id – detailed view of a test
app.get('/admin/test-analytics/:id', async (req, res) => {
  const testId = req.params.id;
  const test = await Test.findById(testId);
  if (!test) return res.send('<h2>Test not found</h2>');

  const attempts = await Result.find({ testId }).populate('userId').sort({ createdAt: -1 });
  const rows = attempts.map(a => `
    <tr>
      <td>${a.userId?.name || '—'}</td>
      <td>${a.score}</td>
      <td>${a.correctAnswers}/${a.totalQuestions}</td>
      <td>${new Date(a.createdAt).toLocaleString()}</td>
    </tr>
  `).join('');

  res.send(`<!DOCTYPE html><html><head><title>${test.title} – Analytics</title>
    <style>
      body { margin: 0; font-family: Arial; background: #f8f9fb; display: flex; }
      .sidebar { width: 220px; background: #fff; padding: 20px; height: 100vh; border-right: 1px solid #ddd; }
      .sidebar h2 { font-size: 18px; margin-bottom: 20px; color: #0f1f3e; }
      .sidebar nav { display: flex; flex-direction: column; gap: 8px; }
      .sidebar nav .section-title { margin-top: 15px; margin-bottom: 6px; font-size: 13px; font-weight: bold; color: #666; text-transform: uppercase; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
      .sidebar nav a { text-decoration: none; color: #0f1f3e; font-size: 14px; padding-left: 10px; }
      .sidebar nav a:hover { text-decoration: underline; }
      .main { flex: 1; padding: 40px; background: #fff; }
      h3 { color: #0f1f3e; }
      table { width: 100%; border-collapse: collapse; background: #fff; margin-top: 20px; }
      th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #e0e0e0; font-size: 14px; }
      th { background: #f4f4f4; }
    </style></head><body>
    <div class="sidebar">
      <h2>🩻 Radiography</h2>
      <nav>
        <div class="section-title">Analytics</div>
        <a href="/admin/test-analytics">← Back to Tests</a>
      </nav>
    </div>
    <div class="main">
      <h3>📋 ${test.title} – Test Analytics</h3>
      <table>
        <thead><tr><th>User</th><th>Score</th><th>Correct</th><th>Date</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </body></html>`);
});



// ✅ Route: /admin/test-analytics/:id/users – shows each user and their latest attempt for a given test
app.get('/admin/test-analytics/:id/users', async (req, res) => {
  const testId = req.params.id;
  const test = await Test.findById(testId);
  if (!test) return res.send('<h2>Test not found</h2>');

  // Get all results for this test and map by userId (latest only)
  const allResults = await Result.find({ testId }).populate('userId').sort({ createdAt: -1 });
  const uniqueResults = [];
  const seen = new Set();

  for (const r of allResults) {
    if (!seen.has(r.userId._id.toString())) {
      seen.add(r.userId._id.toString());
      uniqueResults.push(r);
    }
  }

  const rows = uniqueResults.map(r => `
    <tr>
      <td>${r.userId?.name || '—'}</td>
      <td>${r.score}</td>
      <td>${r.correctAnswers}/${r.totalQuestions}</td>
      <td>${new Date(r.createdAt).toLocaleString()}</td>
      <td><a href="/admin/user-analytics/${r.userId._id}" style="font-size: 13px;">🔍 View User</a></td>
    </tr>
  `).join('');

  res.send(`<!DOCTYPE html><html><head><title>${test.title} – Users Who Attempted</title>
    <style>
      body { margin: 0; font-family: Arial, sans-serif; background: #f8f9fb; display: flex; }
      .sidebar {
        width: 220px;
        background: #fff;
        padding: 20px;
        height: 100vh;
        border-right: 1px solid #ddd;
      }
      .sidebar h2 {
        font-size: 18px;
        margin-bottom: 20px;
        color: #0f1f3e;
      }
      .sidebar nav {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .sidebar nav .section-title {
        margin-top: 15px;
        margin-bottom: 6px;
        font-size: 13px;
        font-weight: bold;
        color: #666;
        text-transform: uppercase;
        border-bottom: 1px solid #ddd;
        padding-bottom: 4px;
      }
      .sidebar nav a {
        text-decoration: none;
        color: #0f1f3e;
        font-size: 14px;
        padding-left: 10px;
      }
      .sidebar nav a:hover {
        text-decoration: underline;
      }
      .main {
        flex: 1;
        padding: 40px;
        background: #fff;
      }
      h3 {
        margin-bottom: 10px;
        color: #0f1f3e;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        background: #fff;
        margin-top: 20px;
        border: 1px solid #e0e0e0;
        border-radius: 6px;
        overflow: hidden;
      }
      th, td {
        padding: 12px 14px;
        text-align: left;
        border-bottom: 1px solid #eee;
        font-size: 14px;
      }
      th {
        background: #f4f4f4;
        color: #333;
        font-weight: bold;
      }
      tr:hover {
        background-color: #f9f9f9;
      }
    </style></head><body>
    <div class="sidebar">
      <h2>🩻 Radiography</h2>
      <nav>
        <div class="section-title">Analytics</div>
        <a href="/admin/dashboard">🏠 Admin Dashboard</a>
        <a href="/admin/test-analytics">📊 All Test Analytics</a>
        <a href="/admin/test-analytics/${testId}">⬅ Back to Test</a>
      </nav>
    </div>
    <div class="main">
      <h3>👥 ${test.title} – User Attempts Overview</h3>
      <p style="font-size: 14px; color: #555;">Showing the most recent attempt from each user.</p>
      <table>
        <thead><tr><th>User</th><th>Score</th><th>Correct</th><th>Latest Attempt</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </body></html>`);
});



app.get('/admin/masterclass', async (req, res) => {
  const results = await Result.find().populate('userId');
  const users = await User.find().sort({ name: 1 });
  const tests = await Test.find().sort({ createdAt: -1 });

  const userStats = {};
  results.forEach(r => {
    const userId = r.userId?._id.toString();
    if (!userStats[userId]) userStats[userId] = { name: r.userId?.name || 'Unknown', lastScore: r.score };
  });

  const chartLabels = Object.values(userStats).map(u => `'${u.name}'`).join(', ');
  const chartData = Object.values(userStats).map(u => u.lastScore).join(', ');

  const userCards = users.map(u => {
    const resultMatches = results.filter(r => r.userId?._id.toString() === u._id.toString());
    const totalTests = resultMatches.length;
    const latestScore = resultMatches[0]?.score || '—';

    return `
      <div style="display:flex; align-items:center; justify-content:space-between; background:#fff; padding:16px; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,0.08); margin:10px 0">
        <div style="display:flex; align-items:center; gap:12px;">
          <div style="width:40px; height:40px; background:#cce; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:14px;">
            ${u.name?.charAt(0) || '?'}
          </div>
          <div>
            <div style="font-weight:bold; font-size:15px;">${u.name}</div>
            <div style="color:#888; font-size:13px;">${u.email}</div>
          </div>
        </div>
        <div style="font-size:13px; color:#333;">${new Date(u.createdAt).toLocaleDateString()}</div>
        <div style="font-size:13px; color:#333;">${totalTests}</div>
        <div style="font-size:13px; color:#333;">${latestScore}</div>
      </div>
    `;
  }).join('');

  const liveNow = users.filter(u => {
    const last = new Date(u.lastActive);
    return (Date.now() - last.getTime()) <= 3 * 60 * 1000;
  }).slice(0, 5);

  const liveUsersHtml = liveNow.map(u => `
    <div style="margin-bottom:10px; padding:10px; background:#e7ffe7; border-radius:6px; font-size:13px;">
      <strong>${u.name}</strong><br>
      ${u.email}<br>
      Last Seen: ${new Date(u.lastActive).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </div>
  `).join('');

  const notLive = users.filter(u => {
    const last = new Date(u.lastActive);
    return (Date.now() - last.getTime()) > 3 * 60 * 1000;
  }).slice(0, 3);

  const notLiveHtml = notLive.map(u => `
    <div style="margin-bottom:10px; padding:10px; background:#f0f0f0; border-radius:6px; font-size:13px;">
      <strong>${u.name}</strong><br>
      ${u.email}<br>
      Last Seen: ${new Date(u.lastActive).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </div>
  `).join('');

  const latestTest = results.sort((a, b) => b.createdAt - a.createdAt)[0];
  const latestTestTitle = tests.find(t => t._id.toString() === latestTest?.testId.toString())?.title || '—';
  const latestTestCount = results.filter(r => r.testId.toString() === latestTest?.testId.toString()).length;

  const lastTestHtml = `
    <div style="margin-top:30px; padding:10px; background:#fef6e4; border-radius:6px; font-size:13px;">
      <strong>🧪 Last Test Accessed</strong><br>
      Title: ${latestTestTitle}<br>
      Total Students: ${latestTestCount}
    </div>
  `;

  // SECTION 6: Daily Question Submission Graph
  const dailyQuestionCounts = await Question.aggregate([
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' }
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
  ]);

  const qLabels = dailyQuestionCounts.map(d => `'${d._id.month}/${d._id.day}'`).join(', ');
  const qData = dailyQuestionCounts.map(d => d.count).join(', ');

  const miniGraphHtml = `
    <div style="margin-top:30px; padding:10px; background:#eef2fb; border-radius:6px;">
      <strong>📈 Questions Created per Day</strong>
      <canvas id="questionGraph" height="150"></canvas>
    </div>
  `;

  res.send(`<!DOCTYPE html><html><head><title>Masterclass Analytics</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels"></script>
    <style>
      body { margin: 0; font-family: Arial; background: #f8f9fb; display: flex; }
      .sidebar {
        width: 220px;
        background: #fff;
        padding: 20px;
        border-right: 1px solid #ddd;
        height: 100vh;
      }
      .rightbar {
        width: 220px;
        background: #fff;
        padding: 20px;
        border-left: 1px solid #ddd;
        height: 100vh;
        overflow-y: auto;
      }
      .sidebar h2 {
        font-size: 18px;
        margin-bottom: 20px;
        color: #0f1f3e;
      }
      .sidebar nav {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .sidebar nav .section-title {
        margin-top: 15px;
        margin-bottom: 6px;
        font-size: 13px;
        font-weight: bold;
        color: #666;
        text-transform: uppercase;
        border-bottom: 1px solid #ddd;
        padding-bottom: 4px;
      }
      .sidebar nav a {
        text-decoration: none;
        color: #0f1f3e;
        font-size: 14px;
        padding-left: 10px;
      }
      .sidebar nav a:hover {
        text-decoration: underline;
      }
      .main-content {
        flex: 1;
        padding: 40px;
        background: #fff;
        overflow-y: auto;
      }
      h3 { color: #0f1f3e; }
      .chart-container {
        margin: 40px 0;
        padding: 20px;
        background: white;
        border-radius: 10px;
        box-shadow: 0 0 6px rgba(0,0,0,0.1);
        height: 500px;
      }
      .user-list {
        margin-top: 40px;
      }
    </style></head><body>
    <div class="sidebar">
      <h2>🩻 Radiography</h2>
      <nav>
        <div class="section-title">Analytics</div>
        <a href="/admin/dashboard">📊 Dashboard</a>
        <a href="/admin/test-analytics">📈 Test Analytics</a>
        <a href="/admin/user-analytics">👥 User Analytics</a>
        <a href="/admin/question-analytics">❓ Question Analytics</a>
        <a href="/admin/masterclass" style="font-weight:bold;">🎓 Masterclass</a>
      </nav>
    </div>
    <div class="main-content">
      <section>
        <h3>🎓 Masterclass – User Last Scores Overview</h3>
        <div class="chart-container">
          <canvas id="userChart"></canvas>
        </div>
      </section>
      <section>
        <h3>👥 Users Overview</h3>
        <div class="user-list">
          ${userCards}
        </div>
      </section>
    </div>
    <div class="rightbar">
      <h3 style="font-size:16px; color:#1a358d; margin-bottom:10px;">🟢 Top 5 Live Users</h3>
      ${liveUsersHtml || '<p style="font-size:13px; color:#888;">No active users right now.</p>'}

      <h3 style="font-size:16px; color:#1a358d; margin-top:30px;">🔘 Recently Seen (Not Live)</h3>
      ${notLiveHtml || '<p style="font-size:13px; color:#888;">No inactive users available.</p>'}

      ${lastTestHtml}
      ${miniGraphHtml}
    </div>

    <script>
      const ctx = document.getElementById('userChart').getContext('2d');
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: [${chartLabels}],
          datasets: [{
            label: 'Last Test Score',
            data: [${chartData}],
            backgroundColor: '#9ACD32'
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          plugins: {
            datalabels: {
              anchor: 'end',
              align: 'right',
              color: '#000',
              font: { weight: 'bold' },
              formatter: (val, ctx) => ctx.chart.data.labels[ctx.dataIndex]
            },
            legend: { display: false },
            tooltip: { enabled: true }
          },
          scales: {
            x: { beginAtZero: true, ticks: { color: '#333' } },
            y: { ticks: { color: '#333' } }
          }
        },
        plugins: [ChartDataLabels]
      });

      new Chart(document.getElementById('questionGraph').getContext('2d'), {
        type: 'line',
        data: {
          labels: [${qLabels}],
          datasets: [{
            label: 'Questions',
            data: [${qData}],
            borderColor: '#1a358d',
            backgroundColor: 'rgba(26, 53, 141, 0.1)',
            fill: true
          }]
        },
        options: {
          responsive: true,
          scales: {
            x: { ticks: { color: '#555' } },
            y: { beginAtZero: true, ticks: { color: '#555' } }
          }
        }
      });
    </script>
  </body></html>`);
});



app.get('/admin/live-users', async (req, res) => {
  console.log('📡 /admin/live-users route hit');

  const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
  const users = await User.find().sort({ lastSeen: -1 });

  const rows = users.map(user => {
    const isLive = user.lastActive && user.lastActive >= threeMinutesAgo;
    const lastSeenFormatted = user.lastSeen
      ? new Date(user.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'N/A';

    return `
      <tr style="background-color: ${isLive ? '#e6f4ea' : '#fff'}">
        <td>${user.name}</td>
        <td>${user.email}</td>
        <td>
          ${isLive
            ? `🟢 Live <span style="color:#666;font-size:12px;">(${lastSeenFormatted})</span>`
            : `🔴 Last Seen: <span style="color:#666;">${lastSeenFormatted}</span>`
          }
        </td>
      </tr>
    `;
  }).join('');

  res.send(`<!DOCTYPE html><html><head><title>Live Users</title>
    <style>
      body{margin:0;font-family:Arial;background:#f8f9fb;display:flex}
      .sidebar{width:220px;background:#fff;padding:20px;height:100vh;border-right:1px solid #ddd}
      .sidebar h2{font-size:18px;margin-bottom:20px;color:#0f1f3e}
      .sidebar nav{display:flex;flex-direction:column;gap:8px}
      .sidebar nav .section-title{margin-top:15px;margin-bottom:6px;font-size:13px;font-weight:bold;color:#666;text-transform:uppercase;border-bottom:1px solid #ddd;padding-bottom:4px}
      .sidebar nav a{text-decoration:none;color:#0f1f3e;font-size:14px;padding-left:10px}
      .sidebar nav a:hover{text-decoration:underline}
      .main{flex:1;padding:40px;background:#fff}
      h3{color:#0f1f3e}
      table{width:100%;border-collapse:collapse;background:#fff;margin-top:20px}
      th,td{padding:10px 12px;text-align:left;border-bottom:1px solid #e0e0e0;font-size:14px}
      th{background:#f4f4f4}
      .refresh-btn {
        margin-top: 10px;
        padding: 8px 16px;
        background: #1a358d;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      }
      .refresh-btn:hover { background: #0f275f; }
    </style></head><body>
      <div class="sidebar">
        <h2>🩻 Radiography</h2>
        <nav>
          <div class="section-title">Management</div>
          <a href="/admin/dashboard">📊 Dashboard</a>
          <a href="/admin/tests">📋 Manage Tests</a>
          <a href="/admin/create-test">➕ Create Test</a>
          <a href="/admin/questions">🧠 Manage Questions</a>
          <a href="/upload-form">📤 Upload Excel</a>
          <div class="section-title">Analytics</div>
          <a href="/admin/test-analytics">📈 Test Analytics</a>
          <a href="/admin/user-analytics" style="font-weight:bold;">👥 User Analytics</a>
          <a href="/admin/question-analytics">❓ Question Analytics</a>
        </nav>
      </div>
      <div class="main">
        <h3>👥 Live Users (Last 3 Minutes)</h3>
        <button onclick="location.reload()" class="refresh-btn">🔄 Refresh</button>
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </body></html>`);
});


app.get('/admin/live-progress', async (req, res) => {
  const FIVE_MIN = 5 * 60 * 1000;
  const now = new Date();
  const progressList = await TestProgress.find({
    status: 'active',
    updatedAt: { $gte: new Date(now - FIVE_MIN) }
  }).populate('userId testId');

  const rows = progressList.length
    ? progressList.map(p => {
        const percent = p.total > 0 ? Math.round(100 * p.index / p.total) : 0;
        const lastSeenFormatted = p.updatedAt
          ? new Date(p.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : 'N/A';
        return `
          <tr style="background-color: ${percent === 100 ? '#e6f4ea' : '#fff'}">
            <td>${p.userId?.name || 'Unknown'}</td>
            <td>${p.testId?.title || ''}</td>
            <td>
              <div style="width:110px;height:16px;background:#eee;border-radius:6px;overflow:hidden;display:inline-block;vertical-align:middle;">
                <div style="width:${percent}%;height:100%;background:#28a745;"></div>
              </div>
              <span style="font-size:13px;vertical-align:middle;margin-left:3px;">${percent}%</span>
            </td>
            <td>Q${p.index + 1} / ${p.total}</td>
            <td>
              <span style="color:#666;font-size:13px;">${lastSeenFormatted}</span>
            </td>
          </tr>
        `;
      }).join('')
    : '<tr><td colspan="5" style="text-align:center;color:#bbb;">No active test takers in the last 5 minutes.</td></tr>';

  res.send(`<!DOCTYPE html><html><head><title>Live Test Progress</title>
    <style>
      body{margin:0;font-family:Arial;background:#f8f9fb;display:flex}
      .sidebar{width:220px;background:#fff;padding:20px;height:100vh;border-right:1px solid #ddd}
      .sidebar h2{font-size:18px;margin-bottom:20px;color:#0f1f3e}
      .sidebar nav{display:flex;flex-direction:column;gap:8px}
      .sidebar nav .section-title{margin-top:15px;margin-bottom:6px;font-size:13px;font-weight:bold;color:#666;text-transform:uppercase;border-bottom:1px solid #ddd;padding-bottom:4px}
      .sidebar nav a{text-decoration:none;color:#0f1f3e;font-size:14px;padding-left:10px}
      .sidebar nav a:hover{text-decoration:underline}
      .main{flex:1;padding:40px;background:#fff}
      h3{color:#0f1f3e}
      table{width:100%;border-collapse:collapse;background:#fff;margin-top:20px}
      th,td{padding:10px 12px;text-align:left;border-bottom:1px solid #e0e0e0;font-size:14px}
      th{background:#f4f4f4}
      .refresh-btn {
        margin-top: 10px;
        padding: 8px 16px;
        background: #1a358d;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      }
      .refresh-btn:hover { background: #0f275f; }
      @media (max-width:900px) {
        .main{padding:10px;}
        .sidebar{display:none;}
      }
    </style>
    </head><body>
      <div class="sidebar">
        <h2>🩻 Radiography</h2>
        <nav>
          <div class="section-title">Management</div>
          <a href="/admin/dashboard">📊 Dashboard</a>
          <a href="/admin/tests">📋 Manage Tests</a>
          <a href="/admin/create-test">➕ Create Test</a>
          <a href="/admin/questions">🧠 Manage Questions</a>
          <a href="/upload-form">📤 Upload Excel</a>
          <div class="section-title">Analytics</div>
          <a href="/admin/test-analytics">📈 Test Analytics</a>
          <a href="/admin/live-progress" style="font-weight:bold;color:#28a745;">🟢 Live Test Progress</a>
          <a href="/admin/live-users">👥 Live Users</a>
          <a href="/admin/user-analytics">📊 User Analytics</a>
          <a href="/admin/question-analytics">❓ Question Analytics</a>
        </nav>
      </div>
      <div class="main">
        <h3>🟢 Live Test Progress (Last 5 Minutes)</h3>
        <button onclick="location.reload()" class="refresh-btn">🔄 Refresh</button>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Test</th>
              <th>Progress</th>
              <th>Question</th>
              <th>Last Activity</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    </body></html>`);
});


function requireAdmin(req, res, next) {
  // No admin check, allow everyone
  return next();
}


// POST route to create a new user and notify admin
app.post('/api/users', async (req, res) => {
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required.' });
  }

  try {
    const user = await User.create({ name, email });

    // Just log the notification to the console
    notifyNewUser(user);

    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Instead of sending a push notification, just log to console
function notifyNewUser(user) {
  console.log('🔔 New User Notification!');
  console.log(`User "${user.name}" (${user.email}) just signed up at ${user.createdAt}`);
}


app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  // Find user by email
  const user = await User.findOne({ email });
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }
  // TODO: Add password validation here!

  // 🔔 Log notification to console
  notifyLogin(user);

  res.json({ message: 'Login successful', user });
});

// Notification function
function notifyLogin(user) {
  console.log('🔔 New login notification:');
  console.log(`User "${user.name}" (${user.email}) logged in at ${new Date().toLocaleString()}`);
}

// Helper to send notification (edit YOUR_PUSH_SERVICE_ENDPOINT)
async function notifyNewUser(user) {
  await fetch('https://YOUR_PUSH_SERVICE_ENDPOINT', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: '/topics/admins',
      title: 'New User Registered!',
      body: `User ${user.name} just signed up!`
    })
  });
}

// ✅ Start Server
app.listen(port, () => {
  console.log(`🚀 Radiography Assistant running at http://localhost:${port}`);
});

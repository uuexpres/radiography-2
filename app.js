// ✅ Core Modules & Packages
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const session = require('express-session');
const fs = require('fs');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { Parser } = require('json2csv');


// ✅ Initialize Express App First
const app = express();

// ✅ Create HTTP Server and Initialize Socket.IO
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);

// ✅ Port
const port = 3068;


// ✅ Middleware Setup
app.use(express.json());                       // replaces bodyParser.json()
app.use(express.urlencoded({ extended: true })); // replaces bodyParser.urlencoded()

// ✅ Session (must come before routes)
app.use(session({
  secret: 'superSecretKey123',   // 🔒 change in production
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 2 } // 2 hours
}));

// ✅ Static assets (safe order)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/hero', express.static(path.join(__dirname, 'public/hero')));
app.use(express.static(path.join(__dirname, 'public')));

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



// ✅ ================= USER ANALYTICS ROUTES =================

// Route: GET /api/user-count
// Purpose: Returns total number of users in the database (useful for dashboards/analytics).
app.get('/api/user-count', async (req, res) => {
  const count = await User.countDocuments();
  res.json({ count });
});


// ✅ ================= USER EXPORT ROUTES =================

// Route: GET /api/export-csv
// Purpose: Exports all users as a CSV file (admin/reporting utility).
app.get('/api/export-csv', async (req, res) => {
  try {
    const users = await User.find().lean(); // Fetch MongoDB data in plain JSON
    const fields = ['_id', 'name', 'email', 'state', 'country']; // Define CSV fields
    const json2csv = new Parser({ fields });
    const csv = json2csv.parse(users);

    // Set headers so browser downloads the file
    res.header('Content-Type', 'text/csv');
    res.attachment('users.csv');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ message: 'Error generating CSV', error });
  }
});


// ✅ ================= USER MANAGEMENT ROUTES =================

// Route: GET /api/users
// Purpose: Fetch all users (basic fetch, no error handling).
app.get('/api/users', async (req, res) => {
  const users = await User.find();
  res.json(users);
});

// Route: GET /api/users
// Purpose: Fetch all users (with error handling). 
// NOTE: This second definition overwrites the first in Express.
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find(); // Use .select(...) if you want to limit fields
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});


// ✅ ================= FILE UPLOAD MIDDLEWARE =================

// Multer upload configuration
const upload = multer({ storage });

// Middleware: Handles uploading multiple types of images in a single request.
// - 'referenceImages' → up to 5 files
// - 'explanationImages' → up to 5 files
const uploadMultiple = upload.fields([
  { name: 'referenceImages', maxCount: 5 },
  { name: 'explanationImages', maxCount: 5 }
]);


// ✅ ================= REAL-TIME USER PRESENCE =================

// Track online users using Socket.IO
// - Marks users online when they connect
// - Updates lastSeen + sets offline when they disconnect
const onlineUsers = new Map();

io.on('connection', (socket) => {
  const userId = socket.handshake.query.userId;

  if (userId) {
    // Store user as online
    onlineUsers.set(userId, socket.id);
    User.findByIdAndUpdate(userId, {
      isOnline: true,
      lastSeen: new Date()
    }).catch(console.error);
    console.log(`🟢 User connected: ${userId}`);
  }

  // Handle user disconnect
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


// ✅ ================= NOTIFICATION SERVICE =================

// Function: notifyLogin
// Purpose: Sends a push notification on login (via Firebase Cloud Messaging).
// Currently just logs the call and response.




/* ========================================================================== *
 * AUTH / SESSION (UI)
 * --------------------------------------------------------------------------
 */


function requireLogin(req, res, next) {
  if (!req.session.userId) {
    console.log('🔒 No session found — redirecting to /login');
    return res.redirect('/login');
  }
  console.log('✅ User session:', req.session.userId);
  next();
}
 

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


  res.redirect('/test-center');
});


app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});



/* ========================================================================== *
 * QUESTIONS (ADMIN MANAGEMENT)
 * --------------------------------------------------------------------------
 * Purpose: CRUD for questions, including bulk import and media.
 * Touches: Question (incl. optionExplanations, imageUrls/Labels), Test.
 * Key routes:
 *   GET  /upload-form                 – Choose test + upload .xlsx
 *   POST /upload-question             – Parse Excel -> insertMany Questions
 *   GET  /admin/questions             – List all questions, actions
 *   GET  /edit-question-detail/:id    – Edit form (choices, per-option expl., votes, images)
 *   POST /update-question-detail/:id  – Persist edits (text, answers, expl., votes, media)
 *   POST /delete-question/:id         – Delete a question
 *   GET  /debug-log/questions         – Dump all questions to server console
 * Notes: Ensure Question schema includes optionExplanations (array) to persist per-choice text.
 * ========================================================================== */

app.get('/debug-log/questions', async (req, res) => {
  try {
    const questions = await Question.find()
      .populate('testId', 'title') // get linked test title
      .lean();

    console.log("\n===== ALL QUESTIONS IN DATABASE =====");
    questions.forEach((q, idx) => {
      console.log(`\n[${idx + 1}] Question ID: ${q._id}`);
      console.log(`Test Title: ${q.testId ? q.testId.title : 'No Test Linked'}`);
      console.log(`Question Text: ${q.title}`);
      console.log(`Choices:`, q.choices);
      console.log(`Option Explanations:`, q.optionExplanations);
      console.log(`General Explanation: ${q.explanation || 'None'}`);
      console.log(`Correct Answer: ${q.correctAnswer}`);
      console.log(`Choice Counts:`, q.choiceCounts);
      console.log(`Image URLs:`, q.imageUrls);
      console.log(`Image Labels:`, q.imageLabels);
    });

    res.send("✅ All questions have been logged to the terminal.");
  } catch (err) {
    console.error("❌ Error fetching questions:", err);
    res.status(500).send("Error fetching questions");
  }
});


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



/* ========================================================================== *
 * ADMIN – TEST SETTINGS & ACCESS
 * --------------------------------------------------------------------------
 * Purpose: Create tests and control visibility/limits/windows.
 * Touches: Test (isActive, isOpenAccess, maxUsers, timeLimit, window).
 * Key routes:
 *   GET  /admin/tests               – Manage tests table (toggle, limits)
 *   POST /admin/update-access/:id   – Infinite vs limited access + maxUsers
 *   POST /admin/toggle-test/:id     – Enable/disable a test
 *   GET  /admin/create-test         – New test form
 *   POST /admin/create-test         – Create test document
 * Notes: UI shows start/end window and timeLimit as a “progress” visualization.
 * ========================================================================== */



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


/* ========================================================================== *
 * ADMIN – USERS
 * --------------------------------------------------------------------------
 * Purpose: Admin view for users and simple status toggles.
 * Touches: User (isActive).
 * Key routes:
 *   GET  /admin/users            – Admin list of users
 *   POST /admin/toggle-user/:id  – Enable/disable a user
 * Notes: Delete button form exists in HTML but no /admin/delete-user route in code.
 * ========================================================================== */


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


/* ========================================================================== *
 * TESTS (TAKING & FLOW)
 * --------------------------------------------------------------------------
 * Purpose: End-to-end test taking, scoring, and per-question timing.
 * Touches: Test, Question, Result, TestProgress, session (answers/timing).
 * Key routes:
 *   GET  /start-test/:testId       – Render test UI + question N, begins timers
 *   POST /submit-question          – Save answer, increment choiceCounts, track time
 *   POST /submit-test              – Score posted answers and persist Result
 *   GET  /submit-test-final/:testId– Finalize session-based run, persist Result
 * Notes: /start-test normalizes correctAnswer to letter; stores timing in session.
 * ========================================================================== */

// GET – read Test & Questions, upsert TestProgress, render HTML

app.post('/save-answer/:testId/:questionId', (req, res) => {
  const { testId, questionId } = req.params;
  const { selected, timeSpent } = req.body;

  if (!req.session.answers) req.session.answers = {};
  req.session.answers[questionId] = { selected, timeSpent };

  console.log("💾 Answer saved:", req.session.answers);
  res.json({ ok: true });
});

app.get('/start-test/:testId', async (req, res) => {
  const t0 = Date.now();
  const { testId } = req.params;
  const questionIndex = parseInt(req.query.index || '0', 10);
  const userId = req.session?.userId || null;

  // ===== AUTOSAVE (from navigation) =========================================
  // We expect query params when user clicks Next/Prev/Finish:
  //   prevQid=<questionId just answered>
  //   chosen=<letter A-D>
  //   elapsedSec=<seconds spent on that question>
  //   finish=1  (optional: if present, redirect to submit-test-final after save)
  const prevQid = (req.query.prevQid || req.query.qid || '').trim();
  const chosenLetterRaw = (req.query.chosen || '').trim();
  const elapsedSec = parseInt(req.query.elapsedSec || req.query.timeSpent || '0', 10) || 0;
  const finishAfterSave = String(req.query.finish || '') === '1';

  // Initialize session stores
  if (!req.session.answers) req.session.answers = {};
  if (!req.session.questionTimes) req.session.questionTimes = {};

  // Helper: normalize (letters or indices -> letter)
  const toLetter = (val, choicesLen) => {
    if (val == null) return null;
    const s = String(val).trim();
    if (/^[A-Za-z]$/.test(s)) return s.toUpperCase();
    const n = parseInt(s, 10);
    if (!isNaN(n)) {
      if (n >= 0 && n < choicesLen) return String.fromCharCode(65 + n);   // 0->A
      if (n >= 1 && n <= choicesLen) return String.fromCharCode(64 + n);  // 1->A
    }
    return null;
  };

  console.log(`\n===== [ROUTE HIT] GET /start-test =====`);
  console.log('📦 Params:', { testId });
  console.log('📩 Query:', { index: req.query.index, parsedIndex: questionIndex, prevQid, chosenLetterRaw, elapsedSec, finishAfterSave });
  console.log('💾 Session snapshot (pre-save):', {
    hasSession: !!req.session,
    userId,
    testStartTime: req.session?.testStartTime || null,
    answersCount: Object.keys(req.session.answers || {}).length
  });

  // Initialize test timer once
  if (questionIndex === 0 && !req.session.testStartTime) {
    req.session.testStartTime = Date.now();
    console.log('⏱️ Initialized testStartTime:', new Date(req.session.testStartTime).toISOString());
  }

  try {
    // Load test & questions
    console.time('🗂️ Test load');
    const test = await Test.findById(testId).lean();
    console.timeEnd('🗂️ Test load');
    console.log('🧾 Test found?', !!test, 'isActive:', test?.isActive);

    console.time('🗂️ Questions load');
    const questions = await Question.find({ testId }).sort({ _id: 1 }).lean();
    console.timeEnd('🗂️ Questions load');
    console.log('🧾 Questions count:', questions.length);

    if (!test?.isActive) {
      console.log('❌ Guard: test not active');
      return res.status(404).send('<h2>Test not available</h2>');
    }
    if (!questions[questionIndex]) {
      console.log('❌ Guard: question index out of range:', { questionIndex, max: questions.length - 1 });
      return res.status(404).send('<h2>Test not available</h2>');
    }

    // ===== AUTOSAVE (resolve chosen letter using the question we just answered)
    if (prevQid && chosenLetterRaw) {
      // Try to normalize against the question's choices length (if we can find it)
      const prevQ = questions.find(q => String(q._id) === prevQid) ||
                    (await Question.findById(prevQid).lean().catch(() => null));
      const normalizedChosen = toLetter(chosenLetterRaw, (prevQ?.choices || []).length) || chosenLetterRaw.toUpperCase();

      req.session.answers[`q_${prevQid}`] = normalizedChosen; // store LETTER
      req.session.questionTimes[prevQid] = elapsedSec;

      console.log('💾 AUTOSAVE from nav:', {
        prevQid,
        normalizedChosen,
        elapsedSec,
        answersCount: Object.keys(req.session.answers || {}).length,
        snapshotKeys: Object.keys(req.session.answers || {})
      });

      // If user clicked Finish and we just saved, short-circuit to final grading
      if (finishAfterSave) {
        console.log('🏁 Finish-after-save detected → redirecting to /submit-test-final');
        return res.redirect(`/submit-test-final/${testId}`);
      }
    }

    // Presence ping (non-blocking)
    if (userId) {
      console.time('👤 Presence upsert');
      const now = new Date();
      const user = await User.findById(userId).select('lastSeen').lean().catch(() => null);
      const updates = { lastActive: now };
      if (!user?.lastSeen || now - new Date(user.lastSeen) > 60 * 1000) updates.lastSeen = now;
      await User.findByIdAndUpdate(userId, updates).catch(()=>{});
      console.timeEnd('👤 Presence upsert');
    }

    // Keep breadcrumb for resume-later UX
    if (userId && typeof TestProgress !== 'undefined') {
      console.time('🧭 TestProgress upsert');
      await TestProgress.findOneAndUpdate(
        { userId, testId },
        { $set: { index: questionIndex, updatedAt: new Date(), status: 'active' } },
        { upsert: true }
      );
      console.timeEnd('🧭 TestProgress upsert');
    }

    // Current question
    const q = questions[questionIndex];
    const totalQuestions = questions.length;
    const isLast = questionIndex + 1 >= totalQuestions;

    // Build per-option rationales map (if present)
    const mapChoiceExplanations = (q) => {
      const out = {};
      const { choices = [], choiceExplanations } = q;
      if (!choiceExplanations) return out;
      if (Array.isArray(choiceExplanations)) {
        choiceExplanations.forEach((text, idx) => {
          const letter = String.fromCharCode(65 + idx);
          if (text) out[letter] = String(text);
        });
      } else if (typeof choiceExplanations === 'object') {
        Object.entries(choiceExplanations).forEach(([k, v]) => {
          if (v == null) return;
          let letter = null;
          if (/^[A-Za-z]$/.test(k)) letter = k.toUpperCase();
          else if (!isNaN(parseInt(k,10))) {
            const idx = parseInt(k,10);
            if (idx >= 0 && idx < choices.length) letter = String.fromCharCode(65 + idx);
            if (idx >= 1 && idx <= choices.length) letter = letter || String.fromCharCode(64 + idx);
          }
          if (letter) out[letter] = String(v);
        });
      }
      return out;
    };

    const choiceExps = mapChoiceExplanations(q);
    const normalizedCorrect = toLetter(q.correctAnswer, (q.choices || []).length);
    const savedForThisQ = req.session.answers[`q_${q._id}`] || null;

    console.log('🧮 Question position', { questionIndex, totalQuestions, isLast });
    console.log('🧮 Answer normalization', { raw: q.correctAnswer, normalized: normalizedCorrect });
    console.log('🧠 Choice explanations keys', Object.keys(choiceExps));
    console.log('🗂️ Pre-checked from session for this q:', { qid: String(q._id), savedForThisQ });

    // ===== Render HTML (with pre-check + nav autosave wiring) ================
    function render({
      title, scenario, vitals, prompt, choices,
      correctLetter, explanationText, choiceExps,
      testIdForClient, questionId, isLast = false
    }) {
      console.groupCollapsed('🧩 Render payload summary');
      console.log({
        hasTitle: !!title,
        hasScenario: !!scenario,
        hasVitals: !!vitals,
        hasPrompt: !!prompt,
        choicesCount: (choices || []).length,
        hasCorrectLetter: !!correctLetter,
        hasExplanation: !!explanationText,
        choiceExpsCount: !!choiceExps ? Object.keys(choiceExps).length : 0,
        testIdForClient,
        questionId: String(questionId || ''),
        isLast
      });
      const secondsFromStart = req.session?.testStartTime ? Math.round((Date.now() - req.session.testStartTime)/1000) : 0;
      console.log('⏱️ Seconds from start (server calc):', secondsFromStart);
      console.groupEnd();

      const choiceRows = (choices || []).map((txt, i) => {
        const letter = String.fromCharCode(65 + i);
        const checked = savedForThisQ === letter ? 'checked' : '';
        return `
          <label class="opt">
            <input type="radio" name="answer" value="${letter}" ${checked} />
            <span class="num">${i + 1}.</span>
            <span class="txt">${String(txt || '')}</span>
          </label>
        `;
      }).join('');

      const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title} — Question ${questionIndex + 1}</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    :root{ --blue:#0f5da6; --blueDark:#0b2b46; --blueLt:#eaf2fb; --ink:#0f1f3e; --ring:#e5e7eb; --bg:#fff; }
    *{box-sizing:border-box}
    body{margin:0;font-family:Arial,Helvetica,sans-serif;color:var(--ink);background:var(--bg);font-size:14px;line-height:1.55}
    .barTop{background:var(--blue);color:#fff;display:flex;align-items:center;gap:12px;padding:8px 16px;font-weight:600}
    .barTop .title{flex:1}
    .barTop .center{flex:1;text-align:center;opacity:.95}
    .barTop .right{margin-left:auto;display:flex;gap:16px;align-items:center}
    .barUtil{background:var(--blueLt);color:#0b2b46;display:flex;align-items:center;gap:12px;padding:8px 16px;border-bottom:1px solid var(--ring)}
    .utilLeft{display:flex;gap:10px;align-items:center}
    .utilRight{margin-left:auto;display:flex;gap:16px;align-items:center}
    .utilLink{display:inline-flex;gap:8px;align-items:center;text-decoration:none;color:inherit;font-weight:600}
    .wrap{max-width:1280px;margin:14px auto 86px;padding:0 24px}
    .grid{display:grid;grid-template-columns:minmax(720px, 840px) 1fr;column-gap:24px;align-items:start}
    .leftCol{min-width:720px}
    .rightPane{border-left:2px solid #dfe6ef;padding-left:20px;min-height:420px;position:sticky; top:72px;max-height:calc(100vh - 110px);overflow:auto;background:#fff}
    .tabs{display:flex;gap:10px;margin:10px 0 8px;border-bottom:1px solid #eee;padding-bottom:6px}
    .tab{background:transparent;border:none;padding:6px 10px;border-radius:0;cursor:pointer;font-weight:700;color:#0b2b46}
    .tab.active{border-bottom:2px solid #0b2b46}
    .tabBody{border:none;border-radius:0;padding:0;margin:0}
    .tabBody p{margin:0 0 8px}
    .itemHead{font-size:13px;color:#64748b;margin-top:12px}
    .stemLead{font-size:15px;font-weight:700;margin:6px 0 4px}
    .promptRow{display:flex;gap:8px;align-items:flex-start;margin:14px 0}
    .caret{color:#2e6ea0;font-weight:700}
    .prompt{font-weight:700}
    .opts{margin-top:8px;display:flex;flex-direction:column;gap:8px}
    .opt{display:flex;gap:10px;align-items:flex-start;border:none;border-radius:0;padding:0;cursor:pointer}
    .opt input{margin-top:4px}
    .num{width:22px;color:#334155}
    .txt{flex:1}
    .submitRow{margin-top:12px}
    .btn{display:inline-flex;align-items:center;gap:8px;border:none;border-radius:6px;padding:9px 16px;font-weight:700;cursor:pointer;text-decoration:none}
    .btn.primary{background:var(--blue);color:#fff}
    .btn.primary:hover{filter:brightness(.95)}
    .meta{margin-top:10px;color:#6b7280;font-size:12px;display:flex;gap:8px;flex-wrap:wrap}
    .meta .dot{opacity:.6}
    .exp h3{margin:0 0 10px;font-size:15px;font-weight:800}
    .exp .ok{color:#16a34a;font-weight:800}
    .exp .err{color:#b91c1c;font-weight:800}
    .exp p{margin:0 0 10px}
    .muted{color:#6b7280}
    .rationales{margin-top:8px}
    .rationales details{margin:6px 0}
    .bottom{position:fixed;left:0;right:0;bottom:0;background:var(--blueDark);color:#e6f2ff;display:flex;align-items:center;gap:12px;padding:10px 14px}
    .leftActions{display:flex;gap:10px}
    .rightActions{margin-left:auto;display:flex;gap:10px}
    .btnLow{background:#143a66;color:#fff;border:none;border-radius:6px;padding:8px 12px;display:flex;gap:8px;align-items:center;text-decoration:none;font-weight:700}
    .btnLow[disabled]{opacity:.5;cursor:not-allowed}
    @media (max-width:860px){.grid{grid-template-columns:1fr}.leftCol{min-width:0}.rightPane{position:static;max-height:none;border-left:none;padding-left:0;border-top:1px solid #dfe6ef;padding-top:16px;margin-top:6px}}
  </style>
</head>
<body>
  <div class="barTop">
    <div class="title">${title}</div>
    <div class="center">Bootcamp.com</div>
    <div class="right"><span>⏱️ <span id="topTime">00:00</span></span><span>🧮 Question ${questionIndex + 1}</span></div>
  </div>
  <div class="barUtil">
    <div class="utilLeft"><a href="#" class="utilLink" id="calcBtn">🧮 Calculator</a></div>
    <div class="utilRight">
      <a href="#" class="utilLink" id="settingsBtn">⚙️ Settings</a>
      <a href="#" class="utilLink" id="markBtn">🔖 Mark for Review</a>
    </div>
  </div>

  <div class="wrap">
    <div class="grid">
      <div class="leftCol">
        <div class="itemHead">Item ${questionIndex + 1}</div>
        <div class="stemLead">The nurse in the emergency department cares for a 38-year-old male client.</div>

        <div class="tabs">
          <button class="tab active" data-tab="notes">Nurses' Notes</button>
          <button class="tab" data-tab="vitals">Vital Signs</button>
        </div>

        <div class="tabBody" id="tab-notes">${scenario}</div>
        <div class="tabBody" id="tab-vitals" style="display:none">${vitals}</div>

        <div class="promptRow"><span class="caret">▸</span><div class="prompt">${prompt}</div></div>

        <form id="qaForm">
          <div class="opts">${choiceRows || '<p class="muted">No choices provided.</p>'}</div>
          <div class="submitRow"><button class="btn primary" type="submit">Submit</button></div>
        </form>

        <div class="meta">
          <span>0 / 1 Incorrect</span><span class="dot">•</span>
          <span>55% Answered Correctly</span><span class="dot">•</span>
          <span>0 / 1 Scoring Rule</span><span class="dot">•</span>
          <span><b id="timeSpent">00:00</b> Time Spent</span>
        </div>
      </div>

      <div class="rightPane">
        <div id="explain" class="exp">
          <p class="muted">Submit your answer to see the explanation.</p>
        </div>
      </div>
    </div>
  </div>

  <div class="bottom">
    <div class="leftActions">
      <a class="btnLow" href="#" id="endBtn">⏩ End</a>
      <a class="btnLow" href="#" id="pauseBtn">⏸️ Pause</a>
    </div>
    <div class="rightActions">
      ${questionIndex > 0
        ? `<a class="btnLow" href="/start-test/${testIdForClient}?index=${questionIndex - 1}" id="prevBtn">◀ Previous</a>`
        : `<button class="btnLow" disabled id="prevBtn">◀ Previous</button>`}
      <a class="btnLow" href="#" id="navBtn">🧭 Navigate</a>
      ${isLast
        ? `<a class="btnLow" href="/submit-test-final/${testIdForClient}" id="finishBtn">Finish ▶</a>`
        : `<a class="btnLow" href="/start-test/${testIdForClient}?index=${questionIndex + 1}" id="nextBtn">Next ▶</a>`}
    </div>
  </div>

  <script>
    console.groupCollapsed('🌐 Client boot');
    console.log('questionIndex', ${questionIndex});
    console.log('testId', ${JSON.stringify(testIdForClient)});
    console.log('questionId', ${JSON.stringify(questionId)});
    console.log('ANSWER_KEY', ${JSON.stringify(correctLetter)});
    console.log('CHOICE_EXPS keys', Object.keys(${JSON.stringify(choiceExps || {})}));
    console.groupEnd();

    // Tabs
    const tButtons = document.querySelectorAll('.tab');
    const notes = document.getElementById('tab-notes');
    const vitals = document.getElementById('tab-vitals');
    tButtons.forEach(b=>{
      b.addEventListener('click',()=>{
        tButtons.forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        const which=b.getAttribute('data-tab');
        if(which==='notes'){notes.style.display='block'; vitals.style.display='none';}
        else {vitals.style.display='block'; notes.style.display='none';}
        console.log('🧭 Tab switch →', which);
      });
    });

    // Timers
    const testStart=${req.session.testStartTime || Date.now()};
    const qStart = Date.now();
    function fmt(s){const m=Math.floor(s/60),x=s%60;return (m<10?'0':'')+m+':' + (x<10?'0':'')+x;}
    function tick(){
      const now=Date.now();
      const total=Math.floor((now-testStart)/1000);
      const top=document.getElementById('topTime'); if(top) top.textContent=fmt(total);
      const sp=document.getElementById('timeSpent'); if(sp) sp.textContent=fmt(Math.floor((Date.now()-qStart)/1000));
    }
    setInterval(tick,1000); tick();

    // Elements
    const nextBtn = document.getElementById('nextBtn');
    const prevBtn = document.getElementById('prevBtn');
    const finishBtn = document.getElementById('finishBtn');

    function currentChoice(){
      const r = document.querySelector('input[name="answer"]:checked');
      return r ? r.value : '';
    }
    function addAutosaveParams(url, finish){
      const u = new URL(url, window.location.origin);
      const chosen = currentChoice(); // letter or ''
      const elapsedSec = Math.floor((Date.now()-qStart)/1000);
      u.searchParams.set('prevQid', ${JSON.stringify(questionId)});
      if (chosen) u.searchParams.set('chosen', chosen);
      u.searchParams.set('elapsedSec', String(elapsedSec));
      if (finish) u.searchParams.set('finish', '1');
      return u.toString();
    }

    nextBtn?.addEventListener('click', (e)=>{
      e.preventDefault();
      const href = nextBtn.getAttribute('href');
      const url = addAutosaveParams(href, false);
      console.log('➡️ Next (autosave) →', url);
      window.location.href = url;
    });

    prevBtn?.addEventListener('click', (e)=>{
      e.preventDefault();
      const href = prevBtn.getAttribute('href');
      const url = addAutosaveParams(href, false);
      console.log('⬅️ Prev (autosave) →', url);
      window.location.href = url;
    });

    finishBtn?.addEventListener('click', (e)=>{
      e.preventDefault();
      // Hop through /start-test one last time to save, then server redirects to /submit-test-final
      const href = \`/start-test/${testIdForClient}?index=${questionIndex}\`;
      const url = addAutosaveParams(href, true);
      console.log('🏁 Finish (autosave) →', url);
      window.location.href = url;
    });

    // Submit (explanation-on-page) unchanged; does not navigate
    const form = document.getElementById('qaForm');
    form?.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const chosen = currentChoice();
      const box = document.getElementById('explain');
      if(!chosen){
        box.innerHTML = '<p class="muted">Please select an answer.</p>';
        return;
      }
      const isCorrect = ${JSON.stringify(correctLetter)} && chosen === ${JSON.stringify(correctLetter)};
      const htmlBody = (${JSON.stringify(explanationText || '')})
        .replace(/\\n\\n/g, '</p><p>')
        .replace(/\\n/g, '<br>');
      box.innerHTML = \`
        <h3>Explanation</h3>
        <p><span class="\${isCorrect ? 'ok' : 'err'}">\${isCorrect ? 'Correct' : 'Incorrect'}</span>
        — Your answer: <b>\${chosen}</b>. Correct answer: <b>${normalizedCorrect ?? '?'}</b>.</p>
        <p>\${htmlBody || '<span class="muted">No explanation provided.</span>'}</p>
      \`;
    });
  </script>
</body>
</html>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      console.log('📤 Sending HTML response. Length (chars):', html.length);
      res.send(html);
      console.log('✅ /start-test HTML sent in', Date.now() - t0, 'ms');
    }

    // Render now
    render({
      title: test.title || 'NCLEX-RN Test (Tutored, Untimed)',
      scenario: q.scenario || '<p><b>Emergency Department</b></p><p><b>1830:</b> Scenario not provided.</p>',
      vitals: q.vitals || '<p class="muted">No vital signs provided.</p>',
      prompt: q.title || '',
      choices: q.choices || [],
      correctLetter: normalizedCorrect,
      explanationText: q.generalExplanation || q.explanation || '',
      choiceExps,
      testIdForClient: testId,
      questionId: q._id,
      isLast
    });

    console.log('✅ /start-test rendered OK in', Date.now() - t0, 'ms');
  } catch (err) {
    console.error('💥 GET /start-test error (will render demo):', err);

    // Minimal demo fallback
    const demo = {
      title: 'NCLEX-RN Test (Demo — offline)',
      scenario: '<p><b>Emergency Department</b></p><p><b>1830:</b> Client presents with abdominal discomfort, mild fever, and nausea.</p>',
      vitals: '<p><b>Temp:</b> 38.1°C &nbsp; <b>HR:</b> 102 &nbsp; <b>BP:</b> 118/76 &nbsp; <b>RR:</b> 20 &nbsp; <b>SpO₂:</b> 97%</p>',
      prompt: 'Which action should the nurse take first?',
      choices: [
        'Administer prescribed antiemetic.',
        'Initiate IV access and obtain labs.',
        'Provide clear liquid diet as tolerated.',
        'Assess for rebound tenderness and guarding.'
      ],
      correctLetter: 'B',
      explanationText: 'Airway/Breathing/Circulation and diagnostic readiness...',
      choiceExps: { A:'...', B:'...', C:'...', D:'...' }
    };

    // Very small HTML to keep server alive
    res.status(200).send(`<pre>Demo fallback loaded.\n${JSON.stringify(demo, null, 2)}</pre>`);
  }
});

// POST — background save of an answer while user stays on the page
app.post('/api/test-progress/answer', async (req, res) => {
  const t0 = Date.now();
  const userId = req.session?.userId || null;
  const { testId, questionId, chosen, elapsedSec = 0, marked = false } = req.body || {};

  console.log('\n===== [ROUTE HIT] POST /api/test-progress/answer =====');
  console.log('👤 userId:', userId);
  console.log('📥 body:', { testId, questionId, chosen, elapsedSec, marked });

  // init session stores
  if (!req.session.answers) req.session.answers = {};
  if (!req.session.questionTimes) req.session.questionTimes = {};
  if (!req.session.testStartTime) req.session.testStartTime = Date.now();

  // helper — normalize any input to a LETTER
  const toLetter = (val, choicesLen) => {
    if (val == null) return null;
    const s = String(val).trim();
    if (/^[A-Za-z]$/.test(s)) return s.toUpperCase();
    const n = parseInt(s, 10);
    if (!isNaN(n)) {
      if (n >= 0 && n < choicesLen) return String.fromCharCode(65 + n);   // 0->A
      if (n >= 1 && n <= choicesLen) return String.fromCharCode(64 + n);  // 1->A
    }
    return null;
  };

  try {
    if (!testId || !questionId) {
      console.warn('⚠️ Missing testId/questionId');
      return res.status(400).json({ ok: false, error: 'Missing testId or questionId' });
    }

    // Load question (need choices length to normalize and to bump choiceCounts)
    const q = await Question.findById(questionId);
    if (!q) {
      console.warn('⚠️ Question not found:', questionId);
      return res.status(404).json({ ok: false, error: 'Question not found' });
    }

    const letter = toLetter(chosen, (q.choices || []).length);
    if (!letter) {
      console.warn('⚠️ Invalid chosen value, not saving:', chosen);
      return res.status(400).json({ ok: false, error: 'Invalid chosen value' });
    }

    // Save into session (source of truth for grading)
    req.session.answers[`q_${questionId}`] = letter;
    req.session.questionTimes[questionId] = Number.isFinite(elapsedSec) ? Math.max(0, elapsedSec) : 0;

    console.log('💾 Session save:', {
      key: `q_${questionId}`,
      letter,
      elapsedSec: req.session.questionTimes[questionId],
      answersCount: Object.keys(req.session.answers).length
    });

    // Best-effort bump of choiceCounts
    try {
      if (!Array.isArray(q.choiceCounts) || q.choiceCounts.length !== q.choices.length) {
        q.choiceCounts = Array(q.choices.length).fill(0);
      }
      const idx = letter.charCodeAt(0) - 65;
      if (idx >= 0 && idx < q.choiceCounts.length) {
        q.choiceCounts[idx]++;
        await q.save();
        console.log('📊 choiceCounts incremented for', letter, '→', q.choiceCounts[idx]);
      } else {
        console.warn('⚠️ Letter index out of range for choiceCounts:', letter);
      }
    } catch (bumpErr) {
      console.warn('📊 choiceCounts update failed (ignored):', bumpErr?.message || bumpErr);
    }

    console.log('✅ /api/test-progress/answer ok in', Date.now() - t0, 'ms');
    return res.json({
      ok: true,
      saved: { testId, questionId, letter, elapsedSec: req.session.questionTimes[questionId], marked: !!marked },
      sessionCounts: {
        answers: Object.keys(req.session.answers).length,
        times: Object.keys(req.session.questionTimes).length
      }
    });
  } catch (err) {
    console.error('💥 /api/test-progress/answer error:', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
});


// POST – submit one question answer
app.post('/submit-question', async (req, res) => {
  const { testId, questionId, index, answer } = req.body;
  const currentIndex = parseInt(index, 10);
  const userId = req.session.userId;

  console.log("\n===== [ROUTE HIT] POST /submit-question =====");
  console.log("📦 Body:", { testId, questionId, index, answer });
  console.log("💾 Session (before):", {
    hasAnswers: !!req.session.answers,
    answers: req.session.answers,
    questionTimes: req.session.questionTimes
  });

  // Save answer in session
  if (!req.session.answers) req.session.answers = {};

  // Normalize letter + text
  const question = await Question.findById(questionId);
  if (!question) {
    console.error("❌ Question not found:", questionId);
    return res.status(404).send("Question not found");
  }

  const answerIdx = answer.charCodeAt(0) - 65;
  const selectedText = question.choices[answerIdx] || null;

  req.session.answers[`q_${questionId}`] = {
    letter: answer,
    text: selectedText
  };

  console.log("📝 Saved to session:", req.session.answers[`q_${questionId}`]);

  try {
    // Update vote counts
    if (!Array.isArray(question.choiceCounts) || question.choiceCounts.length !== question.choices.length) {
      question.choiceCounts = Array(question.choices.length).fill(0);
    }
    question.choiceCounts[answerIdx]++;
    await question.save();

    console.log("📊 Updated choiceCounts:", question.choiceCounts);

    // Track timing
    const now = Date.now();
    const questionStart = req.session.questionStartTime || now;
    const testStart = req.session.testStartTime || now;
    const timeSpent = Math.floor((now - questionStart) / 1000);
    const totalTime = Math.floor((now - testStart) / 1000);

    if (!req.session.questionTimes) req.session.questionTimes = {};
    req.session.questionTimes[questionId] = timeSpent;

    console.log(`⏱️ Time on question ${questionId}: ${timeSpent}s`);
    console.log(`⏱️ Total test time so far: ${totalTime}s`);

    // Update progress
    if (userId) {
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
      console.log("👤 TestProgress updated:", { userId, testId, index: currentIndex });
    }
  } catch (err) {
    console.error("❌ Error in submit-question:", err);
  }

  // Redirect to next question or finalize
  const totalQuestions = await Question.countDocuments({ testId });
  if (currentIndex + 1 >= totalQuestions) {
    console.log("➡️ All questions answered. Redirecting to finalize test.");
    return res.redirect(`/submit-test-final/${testId}`);
  }

  console.log("➡️ Redirecting to next question:", currentIndex + 1);
  return res.redirect(`/start-test/${testId}?index=${currentIndex + 1}`);
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
app.post('/submit-question/:testId/:qid', async (req, res) => {
  const routeT0 = Date.now();
  console.log("\n===== [ROUTE HIT] POST /submit-question =====");

  const { testId, qid } = req.params;
  const userId = req.session.userId || null;
  const selectedAnswer = req.body.answer || '';
  const timeSpent = req.body.timeSpent || 0;

  if (!req.session.answers) req.session.answers = {};
  if (!req.session.questionTimes) req.session.questionTimes = {};

  req.session.answers[`q_${qid}`] = selectedAnswer;
  req.session.questionTimes[qid] = timeSpent;

  console.log("📩 Params:", { testId, qid });
  console.log("💾 Saved to session:", {
    selectedAnswer,
    timeSpent,
    totalAnswers: Object.keys(req.session.answers).length
  });

  // 👉 Check progress
  const totalQuestions = await Question.countDocuments({ testId });
  const answeredCount = Object.keys(req.session.answers).length;

  console.log(`📊 Progress: ${answeredCount}/${totalQuestions} answered`);

  // 🟢 If last question → finalize
  if (answeredCount >= totalQuestions) {
    console.log("🎯 Last question reached. Finalizing test...");

    const gradeT0 = Date.now();
    const questions = await Question.find({ testId }).sort({ _id: 1 });
    console.log("🗂️ CRUD READ Question.find in", Date.now() - gradeT0, "ms", { count: questions.length });

    let correctCount = 0;
    const detailedResults = [];

    for (const question of questions) {
      const qid = question._id.toString();
      const selected = req.session.answers[`q_${qid}`] || '';
      const correct = question.correctAnswer || '';
      const isCorrect = selected === correct;
      const tSpent = req.session.questionTimes[qid] || 0;
      if (isCorrect) correctCount++;

      detailedResults.push({
        questionId: qid,
        selectedAnswer: selected,
        correctAnswer: correct,
        isCorrect,
        timeSpent: tSpent
      });

      console.log("📝 Graded question:", { qid, selected, correct, isCorrect, tSpent });
    }

    const totalTime = req.session.testStartTime
      ? Math.floor((Date.now() - new Date(req.session.testStartTime)) / 1000)
      : 0;
    console.log("⏱️ Total test time:", totalTime, "seconds");

    const resultDoc = {
      userId,
      testId,
      score: Math.round((correctCount / questions.length) * 100),
      totalQuestions: questions.length,
      correctAnswers: correctCount,
      detailedResults,
      timeTaken: totalTime
    };
    console.log("💾 Preparing Result:", resultDoc);

    const saveT0 = Date.now();
    const result = new Result(resultDoc);
    await result.save();
    console.log("✅ Result saved in", Date.now() - saveT0, "ms", { resultId: result._id });

    // cleanup
    delete req.session.answers;
    delete req.session.questionTimes;
    delete req.session.testStartTime;
    console.log("🧹 Session cleaned");

    console.log("➡️ Redirecting to /performance?lastTestId=", testId);
    console.log("✅ /submit-question completed in", Date.now() - routeT0, "ms");
    return res.redirect(`/performance?lastTestId=${testId}`);
  }

  // 🟡 Otherwise → move to next question
  const nextIndex = parseInt(req.body.nextIndex || '0', 10);
  console.log("➡️ Redirecting to next question index:", nextIndex);
  console.log("✅ /submit-question completed in", Date.now() - routeT0, "ms");
  res.redirect(`/start-test/${testId}?index=${nextIndex}`);
});



// GET – finalize a test, grade answers, save Result, redirect to performance
// GET – finalize a test, grade answers, save Result, redirect to performance
// GET — finalize test, grade from session, persist Result, redirect to /performance
app.get('/submit-test-final/:testId', async (req, res) => {
  const t0 = Date.now();
  const { testId } = req.params;
  const userId = req.session?.userId || null;

  console.log('\n===== [ROUTE HIT] GET /submit-test-final =====');
  console.log('👤 userId:', userId, '🧪 testId:', testId);

  // helper
  const toLetter = (val, choicesLen) => {
    if (val == null) return null;
    const s = String(val).trim();
    if (/^[A-Za-z]$/.test(s)) return s.toUpperCase();
    const n = parseInt(s, 10);
    if (!isNaN(n)) {
      if (n >= 0 && n < choicesLen) return String.fromCharCode(65 + n);   // 0->A
      if (n >= 1 && n <= choicesLen) return String.fromCharCode(64 + n);  // 1->A
    }
    return null;
  };

  try {
    const answers = req.session?.answers || {};
    const times = req.session?.questionTimes || {};
    console.log('💾 Session answers (raw keys):', Object.keys(answers));
    console.log('💾 Session times keys:', Object.keys(times));

    console.time('🗂️ Load questions');
    const questions = await Question.find({ testId }).sort({ _id: 1 }).lean();
    console.timeEnd('🗂️ Load questions');
    console.log('🧾 Questions loaded:', questions.length);

    if (!questions.length) {
      console.warn('⚠️ No questions found for test:', testId);
      return res.status(404).send('No questions for this test.');
    }

    let correctCount = 0;
    const detailedResults = [];

    for (const q of questions) {
      const qid = String(q._id);
      const saved = answers[`q_${qid}`] || null; // should already be a LETTER
      const correctLetter = toLetter(q.correctAnswer, (q.choices || []).length) || '';
      const isCorrect = !!saved && saved === correctLetter;
      const tSpent = times[qid] || 0;

      if (isCorrect) correctCount++;

      const selectedText = saved
        ? (q.choices || [])[saved.charCodeAt(0) - 65] || null
        : null;

      detailedResults.push({
        questionId: qid,
        selectedLetter: saved,
        selectedText,
        correctLetter,
        correctText: (q.choices || [])[correctLetter ? correctLetter.charCodeAt(0) - 65 : -1] || null,
        isCorrect,
        timeSpent: tSpent
      });

      console.log('📝 Graded:', { qid, saved, correctLetter, isCorrect, tSpent });
    }

    const totalTime = req.session?.testStartTime
      ? Math.max(0, Math.floor((Date.now() - Number(req.session.testStartTime)) / 1000))
      : 0;

    const scorePct = Math.round((correctCount / questions.length) * 100);

    const resultDoc = {
      userId,
      testId,
      score: scorePct,
      totalQuestions: questions.length,
      correctAnswers: correctCount,
      detailedResults,
      timeTaken: totalTime,
      createdAt: new Date()
    };

    const result = new Result(resultDoc);
    await result.save();

    console.log('✅ Result saved:', { resultId: result._id, score: result.score, correctAnswers: result.correctAnswers });

    // cleanup only test-specific keys
    delete req.session.answers;
    delete req.session.questionTimes;
    delete req.session.testStartTime;

    console.log('🧹 Session cleared (test keys)');
    console.log('➡️ Redirecting to /performance?lastTestId=', testId, ' in', Date.now() - t0, 'ms');

    return res.redirect(`/performance?lastTestId=${testId}`);
  } catch (err) {
    console.error('💥 Error finalizing test:', err);
    return res.status(500).send('Error finalizing test');
  }
});




// When user selects answer
app.post('/save-answer/:testId/:questionId', (req, res) => {
  const { testId, questionId } = req.params;
  const { answer } = req.body;

  if (!req.session.answers) req.session.answers = {};
  if (!req.session.answers[testId]) req.session.answers[testId] = {};

  req.session.answers[testId][questionId] = answer;

  console.log("💾 Saved answer", { testId, questionId, answer });
  res.json({ ok: true });
});


/*  test center aand landing page */

app.get('/', (req, res) => {
  res.send(`
  <!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Radiography Practice Exam Platform</title>
    <style>
      :root{
        --brand:#1a358d;   /* nav high-end blue (or pick your brand color) */
        --accent:#2e6ea0;  /* accent blue */
        --ink:#1f2937;
        --ring:#e5e7eb;
        --bg:#f7f7f7;
        --card:#ffffff;
      }

      *{ box-sizing:border-box }
      body{ margin:0; font-family: Arial, sans-serif; background:var(--bg); color:var(--ink); }
      h2{ font-size:2rem; margin:0 0 12px; }
      p{ line-height:1.6; }

      /* ===== Top maroon (now blue) band ===== */
      .topband{ background:var(--brand); color:#fff; }
      .topband-in{ max-width:1200px; margin:0 auto; padding:0 30px; display:flex; align-items:center; gap:20px; }
      .tabs{ display:flex; align-items:center; gap:24px; height:44px; }
      .tabs a{ display:flex; align-items:center; justify-content:center; height:100%; padding:0 14px; text-decoration:none; font-weight:700; font-size:14px; color:#fff; border-radius:6px 6px 0 0; }
      .tabs a.active{ background:#fff; color:var(--ink); border-bottom:1px solid #fff; position:relative; z-index:2; }
      .top-right{ margin-left:auto; display:flex; align-items:center; gap:16px; font-size:14px; opacity:.95; }
      .flag{ width:18px; height:12px; background:#d00; border:2px solid #fff; border-radius:2px; display:inline-block }
      .bridge{ height:1px; background:#fff; }

      /* ===== Subheader + category row ===== */
      .subhead{ background:#fff; border-bottom:1px solid var(--ring); }
      .subhead-in{ max-width:1200px; margin:0 auto; padding:16px 30px; display:flex; align-items:center; gap:20px; }
      .logo-word{ font-size:28px; font-weight:900; color:var(--accent); letter-spacing:.4px; }
      .search-wrap{ margin-left:auto; display:flex; align-items:center; gap:12px; }
      .search{ display:flex; align-items:center; gap:10px; padding:10px 14px; border:1px solid #e2e6ef; border-radius:24px; width:360px; background:#fff; }
      .search input{ border:0; outline:none; width:100%; background:transparent; font-size:15px; color:#374151; font-style:italic; }
      .icon{ width:34px; height:34px; border:1px solid #e2e6ef; border-radius:50%; display:grid; place-items:center; color:var(--accent); font-weight:900; }

      .catnav{ background:#fff; border-bottom:1px solid var(--ring); }
      .catnav-in{ max-width:1200px; margin:0 auto; padding:10px 30px; display:flex; gap:20px; flex-wrap:wrap; font-weight:600; }
      .catnav-in a{ color:#374151; text-decoration:none; }

      /* ===== HERO ===== */
      .hero-wrap{ background:var(--bg); }
      .hero-in{ max-width:1200px; margin:0 auto; padding:40px 30px; }
      .main{ display:flex; gap:24px; }
      .left-panel{ flex:2; padding:40px; background:#fff; border:1px solid var(--ring); border-radius:8px; }
      .left-panel h1{ color:var(--accent); font-size:2rem; margin-bottom:10px; }
      .left-panel p{ font-size:1rem; margin-bottom:20px; color:#222; }
      .cta{ background:var(--brand); color:#fff; padding:12px 20px; text-decoration:none; border-radius:6px; font-weight:700; display:inline-block; }

      .right-panel{ flex:1; background:#fff; padding:24px; border:1px solid var(--ring); border-radius:8px; }
      .right-panel h3{ margin-top:0; }
      .form-group{ margin-bottom:12px; }
      .form-group input{ width:100%; padding:10px; border:1px solid #ccc; border-radius:4px; }
      .btn{ width:100%; padding:12px; background:var(--brand); color:#fff; border:none; border-radius:6px; font-size:1rem; font-weight:700; }

      /* ===== Sections / cards ===== */
      .section{ max-width:1200px; margin:60px auto; padding:0 30px; }
      .grid-3{ display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:20px; }
      .grid-2{ display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:24px; }
      .card{ background:var(--card); border:1px solid var(--ring); border-radius:10px; box-shadow:0 1px 4px rgba(0,0,0,0.05); }
      .card-in{ padding:20px; }
      .feature{ padding:18px; border-radius:10px; background:#fff; border:1px solid var(--ring); }
      .feature h3{ margin:0 0 6px; font-size:1.1rem; }
      .tags{ display:flex; gap:8px; flex-wrap:wrap; }
      .tag{ background:#fff; border:1px solid var(--ring); border-radius:999px; padding:6px 10px; font-size:.9rem; }

      /* ===== WHITE ZONE ===== */
      .white-zone{ background:#fff; }

      /* more components */
      .split{ display:grid; grid-template-columns:1.1fr .9fr; gap:28px; align-items:center; }
      .split img{ width:100%; height:auto; border-radius:10px; box-shadow:0 10px 28px rgba(0,0,0,.1); }
      .q-card{ background:#fff; border:1px solid var(--ring); border-radius:10px; padding:18px; }
      .choices{ display:grid; gap:10px; margin-top:10px; }
      .choice{ padding:10px; border:1px solid #d6dae3; border-radius:8px; }
      .choice.correct{ border-color:#18a35a; background:#edfbf3; }
      .rationale{ margin-top:10px; font-size:.95rem; color:#0f5132; }
      .stats{ display:grid; grid-template-columns:repeat(auto-fit, minmax(220px,1fr)); gap:16px; }
      .stat{ background:#fff; border:1px solid var(--ring); border-radius:10px; padding:16px; text-align:center; }
      .stat b{ display:block; font-size:28px; }
      .people{ display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:18px; }
      .person{ background:#fff; border:1px solid var(--ring); border-radius:12px; padding:16px; text-align:center; }
      .avatar{ width:76px; height:76px; border-radius:50%; background:#e9ecf5; margin:0 auto 10px; display:grid; place-items:center; font-weight:700; color:#64748b; }
      .timeline{ display:grid; gap:14px; }
      .step{ background:#fff; border:1px solid var(--ring); border-radius:10px; padding:14px 16px; }
      .testimonials{ display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:20px; }
      .testimonial{ background:#fff; padding:20px; border-radius:10px; border:1px solid var(--ring); font-style:italic; }
      .by{ margin-top:8px; color:#6b7280; font-style:normal; }
      .pricing{ display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:20px; }
      .price-card{ background:#fff; padding:22px; border-radius:12px; border:2px solid var(--ring); text-align:center; }
      .price{ font-size:32px; font-weight:800; margin:6px 0 2px; }
      .small{ font-size:.9rem; color:#6b7280; }
      .table-wrap{ overflow:auto; background:#fff; border:1px solid var(--ring); border-radius:10px; }
      table{ border-collapse:collapse; width:100%; min-width:680px; }
      th, td{ border-bottom:1px solid var(--ring); padding:12px 14px; text-align:left; }
      th{ background:#fafafa; }
      .faq-item{ background:#fff; padding:15px; border-radius:10px; border:1px solid var(--ring); margin-bottom:10px; }
      .cta-band{ background:var(--accent); color:#fff; text-align:center; padding:50px 20px; border-radius:12px; }
      .cta-band .cta{ background:#fff; color:var(--accent); }
      .blog{ display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:18px; }
      .post{ background:#fff; border:1px solid var(--ring); border-radius:10px; padding:16px; }
      .contact{ display:grid; grid-template-columns:1.1fr .9fr; gap:18px; }
      .contact form .row{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }
      .input, textarea{ width:100%; padding:10px; border:1px solid #cfd5e1; border-radius:8px; }
      textarea{ min-height:110px; }
      footer{ text-align:center; padding:18px; background:#f1f1f1; font-size:0.9rem; color:#555; border-top:1px solid #ddd; }

      @media (max-width: 900px){
        .search{ width:220px }
        .main{ flex-direction:column }
        .split{ grid-template-columns:1fr }
        .contact{ grid-template-columns:1fr }
      }
    </style>
  </head>
  <body>

    <!-- Top band -->
    <div class="topband">
      <div class="topband-in">
        <nav class="tabs" id="tabs">
          <a href="#" class="active">Students</a>
          <a href="#">Educators</a>
          <a href="#">Clinics</a>
          <a href="#">Continuing Education</a>
          <a href="#">About</a>
          <a href="#">Resources</a>
        </nav>
        <div class="top-right">
          <span>Exam Offers</span><span class="flag" aria-hidden="true"></span><span>English</span>
        </div>
      </div>
      <div class="bridge"></div>
    </div>

    <!-- Subheader -->
    <div class="subhead">
      <div class="subhead-in">
        <div class="logo-word">Radiography Practice Exams</div>
        <div class="search-wrap">
          <label class="search">
            <input type="text" placeholder="Search exams, topics, or tips"/><span aria-hidden="true">🔍</span>
          </label>
          <span class="icon" title="Locations">📍</span>
          <span class="icon" title="Help">❓</span>
        </div>
      </div>
    </div>

    <!-- Category row -->
    <div class="catnav">
      <div class="catnav-in">
        <a href="/test-center">Practice Exams</a>
        <a href="/user/results">My Results</a>
        <a href="/study-guides">Study Guides</a>
        <a href="/pricing">Pricing</a>
        <a href="/help">Help</a>
      </div>
    </div>

    <!-- HERO (light grey background) -->
    <div class="hero-wrap">
      <div class="hero-in">
        <div class="main">
          <div class="left-panel">
            <h1>Pass Your Radiography Certification</h1>
            <p>Access a comprehensive library of practice exams for ARRT®/CAMRT Radiography. Simulate real test timing, review image-based explanations, and track weak areas with analytics.</p>
            <a href="/test-center" class="cta">Start Your First Practice Exam</a>
          </div>

          <!-- EMAIL-ONLY SIGN IN -->
          <div class="right-panel">
            <h3>Sign in to Your Exam Account</h3>
            <form id="emailSignInForm" autocomplete="email">
              <div class="form-group">
                <input type="email" name="email" id="signinEmail" placeholder="Email Address" required>
              </div>
              <button type="submit" class="btn">Sign In</button>
            </form>
            <p style="margin-top:10px; font-size:0.9rem;">
              New to the platform? <a href="/register">Create your free exam account</a>
            </p>
            <div id="signinMsg" style="margin-top:8px; font-size:.9rem; color:#b32833;"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- WHITE ZONE: everything else -->
    <div class="white-zone">
      <section class="section">
        <h2>Built by technologists, engineered for exam day</h2>
        <p>We combine realistic, image-heavy questions with instant feedback and performance analytics so you always know what to study next.</p>
        <div class="grid-3">
          <div class="feature"><h3>Real Exam Simulation</h3><p>Timed and untimed modes mirror ARRT®/CAMRT structure, including image-based items and mixed difficulty.</p></div>
          <div class="feature"><h3>Granular Analytics</h3><p>See item difficulty, topic breakdowns, and time-per-question to focus where it matters most.</p></div>
          <div class="feature"><h3>Explain Like an Instructor</h3><p>Clear rationales and references after each question build understanding, not just memory.</p></div>
        </div>
        <div class="tags" style="margin-top:14px;">
          <span class="tag">Positioning</span><span class="tag">Radiation Protection</span><span class="tag">Physics</span>
          <span class="tag">Anatomy</span><span class="tag">Pathology</span><span class="tag">Quality Control</span>
        </div>
      </section>

      <section class="section">
        <div class="split">
          <img src="/chest.jpg" alt="Exam interface screenshot (question & image viewer)">
          <div>
            <h2>Feels like the real exam—only smarter</h2>
            <p>Flag questions for review, view images fullscreen, and switch between timed or study modes. Your progress auto-saves so you can resume anytime.</p>
            <ul>
              <li>Question review mode with rationales and references</li>
              <li>Keyboard shortcuts for faster navigation</li>
              <li>Mobile-friendly interface</li>
            </ul>
            <a href="/test-center" class="cta" style="margin-top:10px">Browse Practice Exams</a>
          </div>
        </div>
      </section>

      <section class="section">
        <h2>Try a sample question</h2>
        <div class="q-card">
          <strong>A PA chest projection demonstrates the clavicles projecting above the apices. What positioning error is most likely?</strong>
          <div class="choices">
            <div class="choice">A) Insufficient SID</div>
            <div class="choice correct">B) Patient was lordotic (chin/chest raised)</div>
            <div class="choice">C) Excessive rotation toward the left</div>
            <div class="choice">D) Incorrect central ray angle caudad</div>
          </div>
          <div class="rationale">Correct: <b>B</b>. Lordotic positioning elevates clavicles, projecting them above lung apices. Ensure chin lowered and shoulders rolled forward.</div>
        </div>
      </section>

      <section class="section">
        <h2>Outcomes that matter</h2>
        <div class="stats">
          <div class="stat"><b>1,200+</b>Image-based items</div>
          <div class="stat"><b>95%</b>Report higher confidence</div>
          <div class="stat"><b>24/7</b>Access on any device</div>
          <div class="stat"><b>Real-time</b>Analytics & trends</div>
        </div>
      </section>

      <section class="section">
        <h2>Know exactly where to focus</h2>
        <div class="grid-2">
          <div class="card"><div class="card-in"><h3>Topic heatmaps</h3><p>See accuracy by topic and projection to prioritize study time.</p></div></div>
          <div class="card"><div class="card-in"><h3>Timing insights</h3><p>Identify questions that consistently take longer than average.</p></div></div>
          <div class="card"><div class="card-in"><h3>Distractor analysis</h3><p>Review which wrong choices you pick most and why.</p></div></div>
          <div class="card"><div class="card-in"><h3>Progress trends</h3><p>Track improvement week over week to stay on pace.</p></div></div>
        </div>
      </section>

      <section class="section">
        <h2>Meet your instructors</h2>
        <div class="people">
          <div class="person"><div class="avatar">DT</div><b>Doung Tran, MRT(R)</b><div class="small">Positioning & QC</div></div>
          <div class="person"><div class="avatar">CH</div><b>Cathy Hu, BSc, MRT(R)</b><div class="small">Physics & Protection</div></div>
          <div class="person"><div class="avatar">JS</div><b>Jordan Singh, RT(R)</b><div class="small">Anatomy & Pathology</div></div>
        </div>
      </section>

      <section class="section">
        <h2>Your 4-week game plan</h2>
        <div class="timeline">
          <div class="step"><b>Week 1:</b> Baseline timed exam + review rationales. Identify top 3 weak areas.</div>
          <div class="step"><b>Week 2:</b> Drill targeted sets on weak topics. Study mode with notes.</div>
          <div class="step"><b>Week 3:</b> Mix of timed and untimed. Focus on pacing & image interpretation.</div>
          <div class="step"><b>Week 4:</b> Full mock exam + final review of flagged questions.</div>
        </div>
      </section>

      <section class="section">
        <h2>What students say</h2>
        <div class="testimonials">
          <div class="testimonial">“The image explanations finally made positioning ‘click.’ The analytics showed exactly what to fix before exam day.”<div class="by">— Doung T.</div></div>
          <div class="testimonial">“The simulator felt like the real test. Reviewing every wrong answer with references was huge.”<div class="by">— Cathy H.</div></div>
          <div class="testimonial">“Went from 62% to 83% in three weeks. Timing charts helped me stop rushing.”<div class="by">— Priya R.</div></div>
        </div>
      </section>

      <section class="section">
        <h2>Choose your plan</h2>
        <div class="pricing">
          <div class="price-card">
            <h3>Free</h3>
            <div class="price">$0</div>
            <div class="small">Starter access</div>
            <ul style="text-align:left; line-height:1.6;">
              <li>2 practice exams</li>
              <li>Basic analytics</li>
              <li>Limited explanations</li>
            </ul>
            <a href="/register" class="cta" style="margin-top:10px;">Get Started</a>
          </div>
          <div class="price-card">
            <h3>Pro</h3>
            <div class="price">$29/mo</div>
            <div class="small">Most popular</div>
            <ul style="text-align:left; line-height:1.6;">
              <li>Unlimited exams</li>
              <li>Full explanations & references</li>
              <li>Advanced analytics</li>
            </ul>
            <a href="/pricing" class="cta" style="margin-top:10px;">Upgrade</a>
          </div>
          <div class="price-card">
            <h3>Premium</h3>
            <div class="price">$49/mo</div>
            <div class="small">For power users</div>
            <ul style="text-align:left; line-height:1.6;">
              <li>Everything in Pro</li>
              <li>Priority support</li>
              <li>Extra image libraries</li>
            </ul>
            <a href="/pricing" class="cta" style="margin-top:10px;">Go Premium</a>
          </div>
        </div>
      </section>

      <section class="section">
        <h2>How we compare</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Feature</th><th>Our Platform</th><th>Generic Question Bank</th></tr>
            </thead>
            <tbody>
              <tr><td>Image-based items</td><td>Extensive, exam-style</td><td>Limited or none</td></tr>
              <tr><td>Explanations</td><td>Instructor-written with references</td><td>Short or missing</td></tr>
              <tr><td>Analytics</td><td>Topic, timing, distractor analysis</td><td>Basic scoring only</td></tr>
              <tr><td>Exam Simulation</td><td>Timed/untimed, flags, review</td><td>Static quizzes</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="section">
        <h2>Frequently asked questions</h2>
        <div class="faq-item"><h3>Is this affiliated with ARRT® or CAMRT®?</h3><p>No. We are independent and our content is aligned to publicly available blueprints.</p></div>
        <div class="faq-item"><h3>Can I cancel anytime?</h3><p>Yes—subscriptions are month-to-month.</p></div>
        <div class="faq-item"><h3>Do you offer group pricing?</h3><p>Yes—contact us for educator/clinic plans.</p></div>
      </section>

      <section class="section">
        <h2>Latest study tips</h2>
        <div class="blog">
          <div class="post"><b>Mastering chest positioning</b><p class="small">Landmarks, rotation checks, and common pitfalls.</p><a href="/blog/chest-positioning" class="cta" style="padding:8px 12px; font-size:.95rem;">Read</a></div>
          <div class="post"><b>Beat the clock: pacing strategies</b><p class="small">How to avoid spending too long on image-heavy items.</p><a href="/blog/pacing" class="cta" style="padding:8px 12px; font-size:.95rem;">Read</a></div>
          <div class="post"><b>Radiation protection myths</b><p class="small">What matters, what doesn’t, and how it’s tested.</p><a href="/blog/protection-myths" class="cta" style="padding:8px 12px; font-size:.95rem;">Read</a></div>
        </div>
      </section>

      <section class="section">
        <div class="cta-band">
          <h2>Your Essential Training & Exam Prep for ARRT®/CAMRT Radiography</h2>
          <p>Start free, then upgrade when you’re ready. No credit card needed to practice.</p>
          <a href="/register" class="cta">Create Free Account</a>
        </div>
      </section>
    </div><!-- /white-zone -->

    <footer>
      © 2025 Radiography Practice Exam Platform — Prepare · Practice · Succeed
    </footer>

    <script>
      // visual tab toggle only
      document.querySelectorAll('#tabs a').forEach(a => {
        a.addEventListener('click', e => {
          e.preventDefault();
          document.querySelectorAll('#tabs a').forEach(t => t.classList.remove('active'));
          a.classList.add('active');
        });
      });

      // email-only sign-in → redirect to /test-center if email exists
      const signInForm = document.getElementById('emailSignInForm');
      if (signInForm) {
        signInForm.addEventListener('submit', async (e) => {
          e.preventDefault();
          const email = document.getElementById('signinEmail').value.trim();
          const msg = document.getElementById('signinMsg');
          msg.textContent = '';

          if (!email) { msg.textContent = 'Please enter your email.'; return; }

          try {
            const res = await fetch('/signin-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email })
            });
            const data = await res.json();

            if (data.success) {
              window.location.href = '/test-center';
            } else {
              msg.textContent = data.message || 'Email not found. Please create an account.';
            }
          } catch (err) {
            msg.textContent = 'Something went wrong. Please try again.';
          }
        });
      }
    </script>
  </body>
  </html>
  `);
});

// ✅ Test Center Route
app.get('/test-center', requireLogin, async (req, res) => {
  const tests = await Test.find().sort({ createdAt: -1 });
  const now = new Date();

  // ⚠️ Admin message (could later come from DB)
  const adminMessage = "⚠️ Scheduled maintenance on Sunday 10 PM - 12 AM. Please save progress.";

  // ⏱️ Calculate time window
  function timeWindow(createdAt, limitMinutes = 60) {
    const totalMs = limitMinutes * 60_000;
    const end = new Date(createdAt.getTime() + totalMs);
    const msLeft = end - now;
    const msUsed = Math.max(0, Math.min(totalMs, totalMs - msLeft));
    const pctUsed = Math.round((msUsed / totalMs) * 100);

    let label;
    if (msLeft <= 0) label = '⏳ expired';
    else {
      const mins = Math.floor(msLeft / 60_000);
      const hrs = Math.floor(mins / 60);
      const days = Math.floor(hrs / 24);
      const parts = [];
      if (days > 0) parts.push(`${days}d`);
      if (hrs % 24 > 0) parts.push(`${hrs % 24}h`);
      if (mins % 60 > 0) parts.push(`${mins % 60}m`);
      label = `⏳ ${parts.join(' ')} left`;
    }
    return { msLeft, pctUsed, label };
  }

  // 🎨 Status color logic
  function statusColor(msLeft, isActive) {
    if (!isActive) return '#9aa0a6';        // gray for inactive
    if (msLeft <= 0) return '#d93025';      // red for expired
    if (msLeft <= 15 * 60_000) return '#f9ab00'; // yellow for almost over
    return '#1a73e8';                       // blue for normal
  }

  // 🧮 Days left helper
  function daysLeftLabel(date) {
    const diffMs = date - now;
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return '⏳ passed';
    if (diffDays === 0) return '⏳ today';
    return `${diffDays}d left`;
  }

  // 📝 Build sidebar exam grid
  const examGrid = tests.map(t => {
    const dateStr = t.createdAt.toLocaleDateString('en-US', {
      month: 'short', day: '2-digit', year: 'numeric'
    });
    return `<div>📅 ${dateStr} – ${daysLeftLabel(t.createdAt)}</div>`;
  }).join('');

  // 📝 Build table rows
  const rows = tests.map(t => {
    const isActive = t.isActive !== false;
    const win = timeWindow(t.createdAt, t.timeLimit || 60);
    const color = statusColor(win.msLeft, isActive);

    return `
      <tr class="grid-row">
        <td style="border-left:4px solid ${color}">
          <strong>${t.title}</strong><br>
          <span class="desc">${t.description || '— No description —'}</span>
        </td>
        <td>${t.createdAt.toISOString().split('T')[0]}</td>
        <td>—</td>
        <td>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${win.pctUsed}%"></div>
          </div>
          <div class="small-text">${win.pctUsed}% used · ${win.label}</div>
        </td>
        <td style="text-align:right">
          <form action="/start-test/${t._id}" method="GET">
            <button class="start-btn" ${!isActive ? 'disabled' : ''}>
              ▶️ ${isActive ? 'Start' : 'Locked'}
            </button>
          </form>
        </td>
      </tr>
    `;
  }).join('');

  // 📤 Render page
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Radiography Assistant – Test Center</title>
  <style>
    :root{
      --ink:#0f1f3e; --bg:#f8f9fb; --muted:#777;
      --card:#fff; --line:#ddd; --thead:#f8fafc;
      --primary:#1a73e8;
    }
    body{ margin:0; font-family:Arial,sans-serif; display:flex; background:var(--bg); color:var(--ink); }

    /* Sidebar */
    .sidebar{ width:220px; background:#fff; padding:20px; height:100vh;
      display:flex; flex-direction:column; justify-content:space-between; border-right:1px solid #ddd; }
    .sidebar h2{ font-size:18px; margin:0 0 20px; }
    
    /* Grid for exam dates */
    .exam-grid {
      display:grid;
      grid-template-columns:1fr;
      gap:6px;
      margin:10px 0 20px;
      font-size:13px;
    }
    .exam-grid div {
      padding:6px 8px;
      border:1px solid #ddd;
      border-radius:4px;
      background:#f9f9f9;
      text-align:center;
    }

    .logout-form{ margin-top:auto; }
    .logout-form button{ background:#d9534f; color:#fff; border:none; border-radius:6px;
      padding:8px 16px; font-weight:bold; cursor:pointer; }
    .logout-form button:hover{ background:#c9302c; }

    /* Main */
    .main{ flex:1; background:#fff; display:flex; flex-direction:column; }

    .admin-bar{
      display:flex; justify-content:space-between; align-items:center;
      background:#f1f1f1; color:#0f1f3e;
      padding:8px 20px;
      border-top:1px solid #ddd;
      border-bottom:1px solid #ddd;
    }
    .admin-bar button{
      background:#0f1f3e; color:#fff; border:none; border-radius:6px;
      padding:4px 10px;
      cursor:pointer; font-weight:bold; font-size:12px;
    }
    .admin-bar button:hover{ background:#333; }

    .navbar{
      display:flex; gap:12px; align-items:center;
      padding:10px 20px; margin:0;
      border-bottom:1px solid rgba(0,0,0,0.08);
    }
    .navbar button{
      background:#f4f6f9; border:1px solid #ddd; border-radius:6px;
      padding:6px 14px; font-size:14px; cursor:pointer;
    }
    .navbar button:hover{ background:#e9ebf0; }

    .card{ background:#0f1f3e; color:#fff; padding:24px 20px; border-radius:0; margin:0; }

    h2{ margin:18px 0 8px; padding:0 20px; }

    .hr-accent{ height:4px; background:var(--primary); border-radius:999px; margin:8px 20px 18px; }

    table {
      width: 100%;
      margin: 0;
      border-collapse: collapse;
      background: #fff;
      font-family: system-ui, Arial, sans-serif;
    }
    thead th {
      background: #fff;
      color: #000;
      font-weight: bold;
      font-size: 14px;
      padding: 10px 12px;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    td {
      padding: 10px 12px;
      font-size: 14px;
      border-bottom: 1px solid #eee;
      vertical-align: middle;
    }
    tr:hover { background: #fafafa; }

    .progress-bar { width: 120px; height: 10px; background: #e9ecef; }
    .progress-fill { height: 100%; background: #007bff; }
    .small-text { font-size: 12px; color: #555; margin-top: 4px; }

    .start-btn {
      background: #007bff; border: 1px solid #007bff;
      font-size: 13px; padding: 5px 12px;
      color: #fff; cursor: pointer; font-weight: 600; border-radius: 0;
    }
    .start-btn:hover { background: #0056b3; }
    .start-btn[disabled] { background: #ccc; border-color: #ccc; color: #666; cursor: not-allowed; }

    .desc{ font-size:12px; color:var(--muted); }
  </style>
</head>
<body>
  <div class="sidebar">
    <div>
      <h2>🩻 Radiography</h2>
      <p style="font-size:13px; color:#555; margin-top:12px; line-height:1.4;">
        Stay on top of your upcoming exams. Track <strong>days left</strong>, review your <strong>last scores</strong>,<br>
        and keep improving with each practice session. 📈
        <hr>
        <strong>Total Tests Available: ${tests.length}</strong>
      </p>
      <div class="exam-grid">
        ${examGrid}
      </div>
    </div>

    <form class="logout-form" action="/logout" method="POST">
      <button type="submit">🚪 Logout</button>
    </form>
  </div>

  <div class="main">
    <div class="admin-bar">
      <div>${adminMessage}</div>
      <button onclick="navigator.clipboard.writeText('${adminMessage}')">Copy</button>
    </div>

    <div class="card">
      <h3 style="margin:0 0 8px">Welcome to the Weekly Radiography Exam Center</h3>
      <p style="margin:0">
        ✅ Practice tests based on clinical imaging routines<br>
        ✅ Reinforce your anatomy, positioning, and critique skills<br>
        ✅ Monitor your performance and improve each week
      </p>
    </div>

    <div class="navbar">
      <button onclick="location.href='/dashboard'">🏠 Dashboard</button>
      <button onclick="location.href='/results'">📊 Results</button>
      <button onclick="location.href='/practice'">📝 Practice</button>
      <button onclick="location.href='/settings'">⚙️ Settings</button>
    </div>

    <h2>📋 Available Tests</h2>
    <div class="hr-accent"></div>
    <table>
      <thead>
        <tr><th>Test</th><th>Date</th><th>Positioning</th><th>Technique</th><th></th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</body>
</html>
  `);
});




/* ========================================================================== *
 * performance (TAKING & FLOW)
 *   GET  /performance 
 * Notes: /start-test normalizes correctAnswer to letter; stores timing in session.
 * ========================================================================== */




// Convenience: allow /performance/:testId and redirect to query version
app.get('/performance/:testId', requireLogin, (req, res) => {
  return res.redirect(`/performance?lastTestId=${req.params.testId}`);
});

app.get('/performance', requireLogin, async (req, res) => {
  const userId = req.session.userId;
  const lastTestId = (req.query.lastTestId || '').trim();

  console.log('\n===== [ROUTE HIT] GET /performance =====');
  console.log('👤 userId:', userId, '🧪 lastTestId:', lastTestId || '(none)');

  // Pull all results for this user
  const results = await Result.find({ userId })
    .populate('testId')
    .sort({ createdAt: -1 })
    .lean();

  const totalTests = results.length;
  const sumScores = results.reduce((s, r) => s + (r.score || 0), 0);
  const sumCorrect = results.reduce((s, r) => s + (r.correctAnswers || 0), 0);
  const sumQuestions = results.reduce((s, r) => s + (r.totalQuestions || 0), 0);
  const sumTime = results.reduce((s, r) => s + (r.timeTaken || 0), 0);

  const lastScore = totalTests ? (results[0].score || 0) : 0;
  const avgScore = totalTests ? Math.round(sumScores / totalTests) : 0;
  const bestScore = results.reduce((m, r) => Math.max(m, r.score || 0), 0);
  const coverage = sumQuestions ? Math.round((sumCorrect / sumQuestions) * 100) : 0;
  const avgTimeMin = totalTests ? Math.round((sumTime / totalTests) / 60) : 0;

  // Build table rows
  const rows = results.map((r, i) => {
    const isHighlight = lastTestId && String(r.testId?._id || '') === lastTestId;
    const td = (secs) => `${Math.floor(secs / 60)}m ${secs % 60}s`;
    const dateStr = new Date(r.createdAt).toLocaleDateString();
    return `
      <tr class="grid-row ${isHighlight ? 'hl' : ''}" data-tid="${r.testId?._id || ''}">
        <td>${i + 1}</td>
        <td>${r.testId?.title || 'Untitled'}</td>
        <td>${r.score}%</td>
        <td>${r.correctAnswers}/${r.totalQuestions}</td>
        <td>${td(r.timeTaken || 0)}</td>
        <td>${dateStr}</td>
      </tr>
    `;
  }).join('');

  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Radiography Assistant – My Performance</title>
  <style>
    :root{
      --ink:#0f1f3e; --bg:#f8f9fb; --muted:#777;
      --card:#fff; --line:#ddd; --thead:#f8fafc;
      --primary:#1a73e8;
    }
    *{box-sizing:border-box}
    body{ margin:0; font-family:Arial,Helvetica,sans-serif; display:flex; background:var(--bg); color:var(--ink); }

    /* Sidebar (reused style) */
    .sidebar{ width:220px; background:#fff; padding:20px; height:100vh;
      display:flex; flex-direction:column; justify-content:space-between; border-right:1px solid #ddd; }
    .sidebar h2{ font-size:18px; margin:0 0 12px; }
    .s-mini{ font-size:13px; color:#555; line-height:1.45; }
    .s-kpis{ display:grid; gap:8px; margin-top:10px; font-size:13px; }
    .s-kpis div{ background:#f9f9f9; border:1px solid #e5e7eb; border-radius:6px; padding:8px 10px; }

    .logout-form{ margin-top:auto; }
    .logout-form button{ background:#d9534f; color:#fff; border:none; border-radius:6px;
      padding:8px 16px; font-weight:bold; cursor:pointer; }
    .logout-form button:hover{ background:#c9302c; }

    /* Main & header bars (same tone as Test Center) */
    .main{ flex:1; background:#fff; display:flex; flex-direction:column; }
    .admin-bar{
      display:flex; justify-content:space-between; align-items:center;
      background:#f1f1f1; color:#0f1f3e;
      padding:8px 20px;
      border-top:1px solid #ddd;
      border-bottom:1px solid #ddd;
    }
    .admin-bar button{
      background:#0f1f3e; color:#fff; border:none; border-radius:6px;
      padding:4px 10px; cursor:pointer; font-weight:bold; font-size:12px;
    }
    .admin-bar button:hover{ background:#333; }

    .navbar{
      display:flex; gap:12px; align-items:center;
      padding:10px 20px; margin:0;
      border-bottom:1px solid rgba(0,0,0,0.08);
    }
    .navbar button{
      background:#f4f6f9; border:1px solid #ddd; border-radius:6px;
      padding:6px 14px; font-size:14px; cursor:pointer;
    }
    .navbar button:hover{ background:#e9ebf0; }

    .card{ background:#0f1f3e; color:#fff; padding:24px 20px; border-radius:0; margin:0; }
    h2{ margin:18px 0 8px; padding:0 20px; }

    .hr-accent{ height:4px; background:var(--primary); border-radius:999px; margin:8px 20px 18px; }

    /* KPI cards grid */
    .cards{ display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:16px; padding:0 20px; }
    .kcard{ background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:16px; }
    .kcard h3{ margin:0 0 8px; font-size:12px; color:#6b7280; font-weight:700; letter-spacing:.2px; }
    .kcard b{ font-size:22px; }

    /* Table */
    table { width:100%; margin: 12px 0 20px; border-collapse: collapse; background:#fff; }
    thead th {
      background:#fff; color:#000; font-weight: bold; font-size:14px;
      padding:10px 12px; text-align:left; border-bottom:1px solid #ddd;
    }
    td {
      padding:10px 12px; font-size:14px; border-bottom:1px solid #eee; vertical-align:middle;
    }
    tbody tr:hover { background:#fafafa; }
    .hl { background:#fff7cc !important; } /* highlight last result */

    .empty{ padding:20px; color:#555; }
    .toast{
      position:fixed; right:18px; bottom:18px; background:#0f1f3e; color:#fff;
      padding:10px 14px; border-radius:8px; box-shadow:0 6px 24px rgba(0,0,0,.16);
      display:none;
    }
  </style>
</head>
<body>
  <div class="sidebar">
    <div>
      <h2>🩻 Radiography</h2>
      <div class="s-mini">
        Track your performance across practice exams and spot trends over time. 📈
        <div class="s-kpis">
          <div><b>Total Tests:</b> ${totalTests}</div>
          <div><b>Avg Score:</b> ${avgScore}%</div>
          <div><b>Best Score:</b> ${bestScore}%</div>
          <div><b>Coverage:</b> ${coverage}%</div>
        </div>
      </div>
    </div>
    <form class="logout-form" action="/logout" method="POST">
      <button type="submit">🚪 Logout</button>
    </form>
  </div>

  <div class="main">
    <div class="admin-bar">
      <div>Tip: Review missed questions to raise your coverage. Focus on topics with the biggest gaps.</div>
      <button onclick="location.href='/test-center'">Go to Test Center</button>
    </div>

    <div class="card">
      <h3 style="margin:0 0 8px">My Performance</h3>
      <p style="margin:0">
        Your latest score, averages, and full history of completed practice tests.
      </p>
    </div>

    <div class="navbar">
      <button onclick="location.href='/dashboard'">🏠 Dashboard</button>
      <button onclick="location.href='/results'">📁 Results</button>
      <button onclick="location.href='/test-center'">📝 Practice</button>
      <button onclick="location.href='/settings'">⚙️ Settings</button>
    </div>

    <h2>📊 Overview</h2>
    <div class="hr-accent"></div>

    <div class="cards">
      <div class="kcard"><h3>Last Test Score</h3><b>${lastScore}%</b></div>
      <div class="kcard"><h3>Average Score</h3><b>${avgScore}%</b></div>
      <div class="kcard"><h3>Best Score</h3><b>${bestScore}%</b></div>
      <div class="kcard"><h3>Coverage</h3><b>${coverage}%</b></div>
      <div class="kcard"><h3>Avg Time / Test</h3><b>${avgTimeMin} min</b></div>
    </div>

    <h2>🧾 Recent Results</h2>
    <div class="hr-accent"></div>

    ${totalTests === 0 ? `
      <div class="empty">
        You don’t have any completed practice tests yet.
        <a href="/test-center">Start your first test →</a>
      </div>
    ` : `
      <table>
        <thead>
          <tr>
            <th>#</th><th>Test</th><th>Score</th><th>Correct</th><th>Time Taken</th><th>Date</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    `}
  </div>

  <div id="toast" class="toast">Test saved! Your result has been added.</div>

  <script>
    (function(){
      const lastId = ${JSON.stringify(lastTestId)};
      if (!lastId) return;

      // Highlight row + toast
      const row = document.querySelector(\`tr[data-tid="\${lastId}"]\`);
      if (row) {
        row.classList.add('hl');
        row.scrollIntoView({ behavior:'smooth', block:'center' });
      }
      const toast = document.getElementById('toast');
      if (toast) {
        toast.style.display = 'block';
        setTimeout(() => toast.style.display = 'none', 3200);
      }
    })();
  </script>
</body>
</html>
  `);
});



// ✅ Start Server
app.listen(port, () => {
  console.log(`🚀 Radiography Assistant running at http://localhost:${port}`);
});

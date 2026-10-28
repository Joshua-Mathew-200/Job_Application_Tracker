require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const Application = require("./models/Application");
const Counter = require("./models/Counter");

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/applications", require("./routes/applications"));

app.use((err, req, res, next) => {
  res.status(err.status === 400 ? 400 : 500).json({
    success: false,
    message:
      err.status === 400
        ? "Invalid JSON request."
        : "Something went wrong.",
    data: null,
  });
});

app.get("/api/health", (req, res) => {
  const connected = mongoose.connection.readyState === 1;

  res.status(connected ? 200 : 503).json({
    success: connected,
    message: connected
      ? "Backend and MongoDB Atlas are connected."
      : "Database is disconnected.",
    data: null,
  });
});

async function startServer() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is missing from backend/.env");
    }

    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: "jobTrackerExam",
      serverSelectionTimeoutMS: 10000,
    });

    console.log("MongoDB Atlas connected to jobTrackerExam");
    await Application.init();
await Counter.init();

console.log("Application models and indexes are ready");

    const port = process.env.PORT || 5000;

    app.listen(port, () => {
      console.log(`Backend running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Backend startup failed:", error.name);
    console.error("Check the exam URI, password and Atlas IP Access List.");
    process.exit(1);
  }
}

startServer();
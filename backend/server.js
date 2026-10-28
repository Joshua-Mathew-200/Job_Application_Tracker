require("dotenv").config();

const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const session = require("express-session");

const mongoStoreModule = require("connect-mongo");
const MongoStore = mongoStoreModule.default || mongoStoreModule;

const Application = require("./models/Application");
const Counter = require("./models/Counter");
const User = require("./models/User");

const app = express();
const isProduction = process.env.NODE_ENV === "production";

if (isProduction) {
  app.set("trust proxy", 1);
} else {
  app.use(
    cors({
      origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
      credentials: true,
    })
  );
}

app.use(express.json({ limit: "20kb" }));

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
    if (!process.env.MONGODB_URI || !process.env.SESSION_SECRET) {
      throw new Error("Missing database URI or session secret.");
    }

    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: "jobTrackerExam",
      serverSelectionTimeoutMS: 10000,
    });
        // Replace the former global duplicate index with a per-user index.
    try {
      await Application.collection.dropIndex("companyKey_1_roleKey_1");
    } catch (error) {
      if (![26, 27].includes(error.code)) throw error;
    }

    await Promise.all([
      Application.init(),
      Counter.init(),
      User.init(),
    ]);

    const store = MongoStore.create({
      client: mongoose.connection.getClient(),
      dbName: "jobTrackerExam",
      collectionName: "sessions",
    });

    store.on("error", () => {
      console.error("Session storage error.");
    });

    app.use(
      session({
        name: "jobtracker.sid",
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        store,
        cookie: {
          httpOnly: true,
          secure: isProduction,
          sameSite: "lax",
          maxAge: 8 * 60 * 60 * 1000,
        },
      })
    );

    // Reject unexpected browser origins on requests that change data.
    app.use("/api", (req, res, next) => {
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
        const origin = req.get("origin");
        const expectedOrigin = `${req.protocol}://${req.get("host")}`;
        const allowed = isProduction
          ? [expectedOrigin]
          : ["http://localhost:5173", "http://127.0.0.1:5173"];

        if (origin && !allowed.includes(origin)) {
          return res.status(403).json({
            success: false,
            message: "Request origin is not allowed.",
            data: null,
          });
        }
      }
      next();
    });

    app.use("/api/auth", require("./routes/auth"));

    app.use(
      "/api/applications",
      async (req, res, next) => {
        try {
          if (!req.session.userId) {
            return res.status(401).json({
              success: false,
              message: "Please log in.",
              data: null,
            });
          }

          const user = await User.findById(req.session.userId);

          if (!user) {
            return res.status(401).json({
              success: false,
              message: "Please log in again.",
              data: null,
            });
          }

          req.user = user;
          next();
        } catch (error) {
          next(error);
        }
      },
      require("./routes/applications")
    );

    if (isProduction) {
      const frontendDist = path.join(__dirname, "../frontend/dist");

      app.use(express.static(frontendDist));

      app.get("/", (req, res) => {
        res.sendFile(path.join(frontendDist, "index.html"));
      });
    }

    app.use((err, req, res, next) => {
      console.error("Request failed:", err.name);

      res.status(err.status === 400 ? 400 : 500).json({
        success: false,
        message:
          err.status === 400
            ? "Invalid request."
            : "Something went wrong. Please try again.",
        data: null,
      });
    });

    const port = process.env.PORT || 5000;

    app.listen(port, () => {
      console.log("MongoDB connected and login is ready.");
      console.log(`Backend running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Backend startup failed:", error.name);
    console.error(
      "Check MONGODB_URI, SESSION_SECRET and Atlas Network Access."
    );
    process.exit(1);
  }
}

startServer();
const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");

const router = express.Router();

function respond(res, status, success, message, data = null) {
  return res.status(status).json({ success, message, data });
}

function publicUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
  };
}

router.post("/register", async (req, res, next) => {
  const { name, email, password } = req.body || {};

  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.trim().length > 100 ||
    typeof email !== "string" ||
    email.trim().length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
    typeof password !== "string" ||
    password.length < 8 ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    return respond(
      res,
      400,
      false,
      "Enter a name, valid email and password of at least 8 characters (maximum 72 bytes)."
    );
  }

  try {
    await User.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      passwordHash: await bcrypt.hash(password, 12),
    });

    return respond(
      res,
      201,
      true,
      "Account created. You can now log in."
    );
  } catch (error) {
    if (error.code === 11000) {
      return respond(res, 409, false, "This email is already registered.");
    }
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  const { email, password } = req.body || {};

  if (
    typeof email !== "string" ||
    email.length > 254 ||
    typeof password !== "string" ||
    !password ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    return respond(res, 400, false, "Enter your email and password.");
  }

  try {
    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    }).select("+passwordHash");

    const matches = user
      ? await bcrypt.compare(password, user.passwordHash)
      : false;

    if (!matches) {
      return respond(res, 401, false, "Incorrect email or password.");
    }

    req.session.regenerate((error) => {
      if (error) return next(error);

      req.session.userId = user._id.toString();

      req.session.save((error) => {
        if (error) return next(error);

        respond(res, 200, true, "Logged in.", {
          user: publicUser(user),
        });
      });
    });
  } catch (error) {
    next(error);
  }
});

router.get("/me", async (req, res, next) => {
  if (!req.session.userId) {
    return respond(res, 401, false, "Please log in.");
  }

  try {
    const user = await User.findById(req.session.userId);

    if (!user) {
      return respond(res, 401, false, "Please log in again.");
    }

    respond(res, 200, true, "Session loaded.", {
      user: publicUser(user),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/logout", (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);

    res.clearCookie("jobtracker.sid", {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });

    respond(res, 200, true, "Logged out.");
  });
});

module.exports = router;
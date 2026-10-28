const express = require("express");
const mongoose = require("mongoose");
const Application = require("../models/Application");
const Counter = require("../models/Counter");

const router = express.Router();

const transitions = {
  Applied: ["Interview", "Rejected"],
  Interview: ["Offer", "Rejected"],
  Offer: ["Accepted", "Declined"],
  Rejected: [],
  Accepted: [],
  Declined: [],
};

const finalStatuses = ["Rejected", "Accepted", "Declined"];
const jobTypes = ["Full-time", "Internship", "Contract"];

const normalize = (value) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();

function today() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function serialize(document) {
  const item = document.toObject ? document.toObject() : document;

  return {
    ...item,
    isOverdue:
      item.status === "Applied" && today() > item.followUpDate,
    nextStatuses: transitions[item.status],
    canDelete:
      item.status === "Applied" || finalStatuses.includes(item.status),
  };
}

function fail(res, status, message) {
  return res.status(status).json({
    success: false,
    message,
    data: null,
  });
}

function validate(body, creating) {
  const { company, role, jobType, salary, notes } = body;

  if (
    typeof company !== "string" ||
    !company.trim() ||
    company.trim().length > 100 ||
    typeof role !== "string" ||
    !role.trim() ||
    role.trim().length > 100
  ) {
    return "Company and role are required and must be within 100 characters.";
  }

  if (!/^[A-Za-z]{3}/.test(company.trim())) {
    return "Company must begin with at least three English letters.";
  }

  if (!jobTypes.includes(jobType)) {
    return "Select a valid job type.";
  }

  if (
    salary !== undefined &&
    salary !== null &&
    salary !== "" &&
    (
      !["string", "number"].includes(typeof salary) ||
      !Number.isFinite(Number(salary)) ||
      Number(salary) < 0
    )
  ) {
    return "Salary must be a non-negative number.";
  }

  if (
    notes !== undefined &&
    (typeof notes !== "string" || notes.length > 2000)
  ) {
    return "Notes must be text within 2000 characters.";
  }

  if (creating) {
    const value = body.appliedDate;

    if (
      typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
      return "Provide a valid applied date.";
    }

    const parsed = new Date(`${value}T00:00:00.000Z`);

    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value
    ) {
      return "Provide a real calendar date.";
    }

    if (value > today()) {
      return "Applied date cannot be in the future.";
    }
  }

  return null;
}

function editableFields(body) {
  return {
    company: body.company.trim().replace(/\s+/g, " "),
    companyKey: normalize(body.company),
    role: body.role.trim().replace(/\s+/g, " "),
    roleKey: normalize(body.role),
    jobType: body.jobType,
    salary:
      body.salary === "" || body.salary == null
        ? null
        : Number(body.salary),
    notes: body.notes || "",
  };
}

function handleError(error, res) {
  if (error.code === 11000) {
    return fail(
      res,
      409,
      "An active application already exists for this company and role. Refresh before retrying."
    );
  }

  if (error.name === "ValidationError") {
    return fail(res, 400, "Invalid application data.");
  }

  console.error(error.name);
  return fail(res, 500, "Server error. Please try again.");
}

// GET all applications, with backend search and status filtering.
router.get("/", async (req, res) => {
  try {
    const filter = {};
    const { status, search } = req.query;

    if (status && !Object.hasOwn(transitions, status)) {
      return fail(res, 400, "Invalid status filter.");
    }

    if (status) filter.status = status;

    if (search) {
      if (typeof search !== "string" || search.length > 100) {
        return fail(res, 400, "Search must be within 100 characters.");
      }

      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.company = { $regex: escaped, $options: "i" };
    }

    const applications = await Application.find(filter)
      .sort({ createdAt: -1 });

    const groups = await Application.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    const counts = Object.fromEntries(
      Object.keys(transitions).map((key) => [key, 0])
    );

    groups.forEach((group) => {
      counts[group._id] = group.count;
    });

    res.json({
      success: true,
      message: "Applications loaded.",
      data: {
        applications: applications.map(serialize),
        counts,
      },
    });
  } catch (error) {
    handleError(error, res);
  }
});

// POST a new application.
router.post("/", async (req, res) => {
  const body = req.body || {};
  const errorMessage = validate(body, true);

  if (errorMessage) return fail(res, 400, errorMessage);

  try {
    let application;

    await mongoose.connection.transaction(async (session) => {
      const fields = editableFields(body);

      const duplicate = await Application.findOne({
        companyKey: fields.companyKey,
        roleKey: fields.roleKey,
        active: true,
      }).session(session);

      if (duplicate) {
        const error = new Error("Duplicate active application.");
        error.code = 11000;
        throw error;
      }

      const prefix = fields.company.slice(0, 3).toUpperCase();
      let applicationId;

      // Separate sequence for each normalized company.
      // Skip an ID if another company shares its three-letter prefix.
      do {
        const counter = await Counter.findOneAndUpdate(
          { _id: fields.companyKey },
          { $inc: { sequence: 1 } },
          { upsert: true, new: true, session }
        );

        applicationId =
          `JA-${prefix}-${String(counter.sequence).padStart(3, "0")}`;
      } while (
        await Application.exists({ applicationId }).session(session)
      );

      const followUp = new Date(
        `${body.appliedDate}T00:00:00.000Z`
      );
      followUp.setUTCDate(followUp.getUTCDate() + 7);

      const created = await Application.create(
        [{
          ...fields,
          applicationId,
          appliedDate: body.appliedDate,
          followUpDate: followUp.toISOString().slice(0, 10),
          status: "Applied",
          active: true,
          history: [{
            status: "Applied",
            changedAt: new Date(),
          }],
        }],
        { session }
      );

      application = created[0];
    });

    res.status(201).json({
      success: true,
      message: "Application added.",
      data: serialize(application),
    });
  } catch (error) {
    handleError(error, res);
  }
});

// Validate MongoDB IDs for the routes below.
router.use("/:id", (req, res, next) => {
  if (!mongoose.isObjectIdOrHexString(req.params.id)) {
    return fail(res, 400, "Invalid application identifier.");
  }
  next();
});

// GET one application and its history.
router.get("/:id", async (req, res) => {
  try {
    const application = await Application.findById(req.params.id);

    if (!application) return fail(res, 404, "Application not found.");

    res.json({
      success: true,
      message: "Application loaded.",
      data: serialize(application),
    });
  } catch (error) {
    handleError(error, res);
  }
});

// PUT editable application details.
router.put("/:id", async (req, res) => {
  const body = req.body || {};

  if (
    ["applicationId", "appliedDate", "followUpDate",
      "status", "history", "active"].some(
      (key) => Object.hasOwn(body, key)
    )
  ) {
    return fail(
      res,
      400,
      "Only company, role, job type, salary and notes can be edited."
    );
  }

  const errorMessage = validate(body, false);
  if (errorMessage) return fail(res, 400, errorMessage);

  try {
    const application = await Application.findByIdAndUpdate(
      req.params.id,
      { $set: editableFields(body) },
      { new: true, runValidators: true }
    );

    if (!application) return fail(res, 404, "Application not found.");

    res.json({
      success: true,
      message: "Application updated.",
      data: serialize(application),
    });
  } catch (error) {
    handleError(error, res);
  }
});

// PATCH status using an atomic transition check.
router.patch("/:id/status", async (req, res) => {
  const status = req.body?.status;

  if (!Object.hasOwn(transitions, status || "")) {
    return fail(res, 400, "Select a valid status.");
  }

  try {
    const allowedPrevious = Object.keys(transitions).filter(
      (previous) => transitions[previous].includes(status)
    );

    const application = await Application.findOneAndUpdate(
      {
        _id: req.params.id,
        status: { $in: allowedPrevious },
      },
      {
        $set: {
          status,
          active: !finalStatuses.includes(status),
        },
        $push: {
          history: { status, changedAt: new Date() },
        },
      },
      { new: true, runValidators: true }
    );

    if (!application) {
      const existing = await Application.findById(req.params.id);

      if (!existing) return fail(res, 404, "Application not found.");

      return fail(
        res,
        400,
        `Cannot change status from ${existing.status} to ${status}.`
      );
    }

    res.json({
      success: true,
      message: "Status updated.",
      data: serialize(application),
    });
  } catch (error) {
    handleError(error, res);
  }
});

// DELETE only Applied or final applications.
router.delete("/:id", async (req, res) => {
  try {
    const application = await Application.findOneAndDelete({
      _id: req.params.id,
      status: { $in: ["Applied", ...finalStatuses] },
    });

    if (!application) {
      const existing = await Application.findById(req.params.id);

      if (!existing) return fail(res, 404, "Application not found.");

      return fail(
        res,
        400,
        "Applications in Interview or Offer cannot be deleted."
      );
    }

    res.json({
      success: true,
      message: "Application deleted.",
      data: null,
    });
  } catch (error) {
    handleError(error, res);
  }
});

module.exports = router;
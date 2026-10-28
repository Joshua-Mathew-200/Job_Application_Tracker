const mongoose = require("mongoose");

const STATUSES = [
  "Applied",
  "Interview",
  "Offer",
  "Rejected",
  "Accepted",
  "Declined",
];

const applicationSchema = new mongoose.Schema(
  {
    applicationId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
    },
    company: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    companyKey: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    roleKey: {
      type: String,
      required: true,
    },
    jobType: {
      type: String,
      enum: ["Full-time", "Internship", "Contract"],
      required: true,
    },
    appliedDate: {
      type: String,
      required: true,
      immutable: true,
    },
    followUpDate: {
      type: String,
      required: true,
      immutable: true,
    },
    salary: {
      type: Number,
      min: 0,
      default: null,
    },
    notes: {
      type: String,
      maxlength: 2000,
      default: "",
    },
    status: {
      type: String,
      enum: STATUSES,
      default: "Applied",
      required: true,
    },
    active: {
      type: Boolean,
      default: true,
      required: true,
    },
    history: [
      {
        _id: false,
        status: {
          type: String,
          enum: STATUSES,
          required: true,
        },
        changedAt: {
          type: Date,
          required: true,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true }
);

// Block duplicate company and role while an application is active.
applicationSchema.index(
  { companyKey: 1, roleKey: 1 },
  {
    unique: true,
    partialFilterExpression: { active: true },
  }
);

module.exports = mongoose.model("Application", applicationSchema);
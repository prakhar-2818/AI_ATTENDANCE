const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
    {
        student: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        studentId: {
            type: String,
            required: true
        },

        studentName: {
            type: String,
            required: true
        },

        subject: {
            type: String,
            required: true
        },

        date: {
            type: String,
            required: true
        },

        time: {
            type: String,
            required: true
        },

        status: {
            type: String,
            enum: ["Present", "Absent"],
            default: "Present"
        },

        verification: {
            type: String,
            enum: ["face", "manual"],
            default: "face"
        },

        livenessPassed: {
            type: Boolean,
            default: false
        },

        confidence: {
            type: Number,
            default: null
        }
    },
    {
        timestamps: true
    }
);

attendanceSchema.index(
    {
        studentId: 1,
        subject: 1,
        date: 1
    },
    {
        unique: true
    }
);

module.exports = mongoose.model(
    "Attendance",
    attendanceSchema
);
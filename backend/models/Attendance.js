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
            enum: ["face", "manual", "system"],
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


// ==========================================
// IMPORTANT
// ==========================================
// Same student can have:
//
// DE 03:00 - 03:30
// DE 03:30 - 04:00
//
// on the same date.
//
// Therefore time is included in unique index.
// ==========================================

attendanceSchema.index(
    {
        studentId: 1,
        subject: 1,
        date: 1,
        time: 1
    },
    {
        unique: true
    }
);


module.exports =
    mongoose.model(
        "Attendance",
        attendanceSchema
    );
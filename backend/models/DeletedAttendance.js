const mongoose = require("mongoose");

const deletedAttendanceSchema = new mongoose.Schema(
    {
        date: {
            type: String,
            required: true
        },

        subject: {
            type: String,
            required: true
        },

        startTime: {
            type: String,
            required: true
        },

        endTime: {
            type: String,
            required: true
        }
    },
    {
        timestamps: true
    }
);

deletedAttendanceSchema.index(
    {
        date: 1,
        subject: 1,
        startTime: 1,
        endTime: 1
    },
    {
        unique: true
    }
);

module.exports = mongoose.model(
    "DeletedAttendance",
    deletedAttendanceSchema
);
const mongoose = require("mongoose");

const calendarSlotSchema = new mongoose.Schema(
    {
        day: {
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

module.exports = mongoose.model(
    "CalendarSlot",
    calendarSlotSchema
);
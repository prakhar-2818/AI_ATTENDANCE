const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        userId: {
            type: String,
            required: true,
            unique: true
        },

        name: {
            type: String,
            required: true
        },

        email: {
            type: String
        },

        passwordHash: {
            type: String,
            required: true
        },

        role: {
            type: String,
            enum: ["admin", "student"],
            required: true
        },

        // Face registration status
        faceRegistered: {
            type: Boolean,
            default: false
        },

        // Uploaded face image
        faceImage: {
            type: String,
            default: null
        },

        // Face embedding will be stored here
        // after AI processing
        faceEmbedding: {
            type: [Number],
            default: null
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
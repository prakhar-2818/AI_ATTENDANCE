const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/User");

const router = express.Router();

router.post("/login", async (req, res) => {

    try {

        const { userId, password } = req.body;

        if (!userId || !password) {

            return res.status(400).json({
                success: false,
                message: "User ID and password are required"
            });
        }

        const user = await User.findOne({
            userId: userId
        });

        if (!user) {

            return res.status(401).json({
                success: false,
                message: "Invalid credentials"
            });
        }

        const validPassword = await bcrypt.compare(
            password,
            user.passwordHash
        );

        if (!validPassword) {

            return res.status(401).json({
                success: false,
                message: "Invalid credentials"
            });
        }

        const token = jwt.sign(
            {
                id: user._id,
                userId: user.userId,
                name: user.name,
                role: user.role
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "1d"
            }
        );

        res.json({

            success: true,

            token,

            user: {
                id: user._id,
                userId: user.userId,
                name: user.name,
                role: user.role,
                faceRegistered: user.faceRegistered
            }
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
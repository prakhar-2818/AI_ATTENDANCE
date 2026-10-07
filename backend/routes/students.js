const express = require("express");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const axios = require("axios");
const fs = require("fs");
const FormData = require("form-data");

const User = require("../models/User");
const { auth, adminOnly } = require("../middleware/auth");

const router = express.Router();


// ==========================================
// MULTER CONFIGURATION
// ==========================================

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "uploads/");
    },

    filename: function (req, file, cb) {
        const extension = path.extname(file.originalname);

        const filename =
            req.params.id +
            "-" +
            Date.now() +
            extension;

        cb(null, filename);
    }
});

const upload = multer({
    storage: storage,

    limits: {
        fileSize: 5 * 1024 * 1024
    },

    fileFilter: function (req, file, cb) {

        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/jpg",
            "image/webp"
        ];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Only image files are allowed"));
        }
    }
});


// ==========================================
// GET ALL STUDENTS
// ==========================================

router.get("/", auth, adminOnly, async (req, res) => {

    try {

        const students = await User.find({
            role: "student"
        }).select("-passwordHash -faceEmbedding");

        res.json({
            success: true,
            students: students
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            message: error.message
        });

    }

});


// ==========================================
// CREATE STUDENT
// ==========================================

router.post("/", auth, adminOnly, async (req, res) => {

    try {

        const {
            userId,
            name,
            email,
            password
        } = req.body;

        if (!userId || !name || !password) {

            return res.status(400).json({
                success: false,
                message: "User ID, name and password are required"
            });

        }

        const existingStudent =
            await User.findOne({ userId });

        if (existingStudent) {

            return res.status(400).json({
                success: false,
                message: "Student ID already exists"
            });

        }

        const passwordHash =
            await bcrypt.hash(password, 10);

        const student = await User.create({

            userId,
            name,
            email,
            passwordHash,

            role: "student",

            faceRegistered: false,

            faceImage: null,

            faceEmbedding: null

        });

        res.status(201).json({

            success: true,

            message: "Student created successfully",

            student: {

                id: student._id,

                userId: student.userId,

                name: student.name,

                email: student.email,

                faceRegistered:
                    student.faceRegistered

            }

        });

    } catch (error) {

        res.status(500).json({

            success: false,

            message: error.message

        });

    }

});


// ==========================================
// UPLOAD FACE + AI EMBEDDING
// ==========================================

router.post(
    "/:id/face",
    auth,
    adminOnly,
    upload.single("faceImage"),

    async (req, res) => {

        try {

            // ----------------------------------
            // Check uploaded image
            // ----------------------------------

            if (!req.file) {

                return res.status(400).json({

                    success: false,

                    message: "Face image is required"

                });

            }


            // ----------------------------------
            // Find student
            // ----------------------------------

            const student =
                await User.findOne({

                    _id: req.params.id,

                    role: "student"

                });


            if (!student) {

                return res.status(404).json({

                    success: false,

                    message: "Student not found"

                });

            }


            // ----------------------------------
            // Create multipart form
            // ----------------------------------

            const form = new FormData();


            form.append(
                "image",
                fs.createReadStream(req.file.path),
                {

                    filename:
                        req.file.originalname,

                    contentType:
                        req.file.mimetype

                }
            );


            // ----------------------------------
            // Send image to Python AI
            // ----------------------------------

            const aiResponse =
                await axios.post(

                    "http://127.0.0.1:8000/process-face",

                    form,

                    {

                        headers:
                            form.getHeaders(),

                        maxContentLength:
                            Infinity,

                        maxBodyLength:
                            Infinity,

                        timeout: 30000

                    }

                );


            const aiData =
                aiResponse.data;


            // ----------------------------------
            // AI validation
            // ----------------------------------

            if (!aiData.success) {

                return res.status(400).json({

                    success: false,

                    message:
                        aiData.message

                });

            }


            // ----------------------------------
            // Check embedding
            // ----------------------------------

            if (
                !aiData.embedding ||
                !Array.isArray(aiData.embedding)
            ) {

                return res.status(500).json({

                    success: false,

                    message:
                        "AI embedding was not returned"

                });

            }


            // ----------------------------------
            // Save student face data
            // ----------------------------------

            student.faceImage =
                req.file.path;

            student.faceEmbedding =
                aiData.embedding;

            student.faceRegistered =
                true;


            await student.save();


            // ----------------------------------
            // Success response
            // ----------------------------------

            res.json({

                success: true,

                message:
                    "Face registered successfully",

                student: {

                    id: student._id,

                    userId:
                        student.userId,

                    name:
                        student.name,

                    faceRegistered:
                        true,

                    embeddingLength:
                        aiData.embedding.length

                }

            });


        } catch (error) {

            console.log(
                "FACE REGISTRATION ERROR:"
            );

            console.log(
                error.response?.data ||
                error.message
            );


            res.status(500).json({

                success: false,

                message:
                    error.response?.data?.message ||
                    error.message

            });

        }

    }
);


// ==========================================
// CHANGE FACE STATUS
// ==========================================

router.patch(
    "/:id/face-status",
    auth,
    adminOnly,

    async (req, res) => {

        try {

            const student =
                await User.findOne({

                    _id: req.params.id,

                    role: "student"

                });


            if (!student) {

                return res.status(404).json({

                    success: false,

                    message: "Student not found"

                });

            }


            student.faceRegistered =
                req.body.registered === true;


            if (!student.faceRegistered) {

                student.faceImage = null;

                student.faceEmbedding = null;

            }


            await student.save();


            res.json({

                success: true,

                message:
                    "Face status updated",

                faceRegistered:
                    student.faceRegistered

            });


        } catch (error) {

            res.status(500).json({

                success: false,

                message:
                    error.message

            });

        }

    }
);


module.exports = router;
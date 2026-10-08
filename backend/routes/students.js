const express = require("express");
const router = express.Router();

const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const User = require("../models/User");
const Attendance = require("../models/Attendance");

const { auth, adminOnly } = require("../middleware/auth");


// =====================================================
// UPLOAD DIRECTORY
// =====================================================

const uploadDir = path.join(
    __dirname,
    "../uploads"
);

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, {
        recursive: true
    });
}


// =====================================================
// MULTER STORAGE
// =====================================================

const storage = multer.diskStorage({

    destination: function (req, file, cb) {

        cb(
            null,
            uploadDir
        );

    },

    filename: function (req, file, cb) {

        const ext =
            path.extname(
                file.originalname
            );

        const filename =
            Date.now() +
            "-" +
            Math.round(
                Math.random() * 1e9
            ) +
            ext;

        cb(
            null,
            filename
        );

    }

});


const upload = multer({

    storage: storage,

    limits: {

        fileSize:
            5 * 1024 * 1024

    },

    fileFilter: function (req, file, cb) {

        const allowed = [
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp"
        ];

        if (
            allowed.includes(
                file.mimetype
            )
        ) {

            cb(
                null,
                true
            );

        } else {

            cb(
                new Error(
                    "Only image files are allowed"
                )
            );

        }

    }

});


// =====================================================
// GET ALL STUDENTS
// =====================================================

router.get(
    "/",
    auth,
    adminOnly,

    async function (req, res) {

        try {

            const students =
                await User.find({

                    role: "student"

                })
                .select(
                    "-passwordHash"
                )
                .sort({

                    createdAt: -1

                });

            return res.json({

                success: true,

                students

            });

        }

        catch (error) {

            console.log(
                "GET STUDENTS ERROR:",
                error.message
            );

            return res.status(500).json({

                success: false,

                message:
                    error.message

            });

        }

    }
);


// =====================================================
// CREATE STUDENT
// =====================================================

router.post(
    "/",
    auth,
    adminOnly,

    async function (req, res) {

        try {

            const {
                userId,
                name,
                email,
                password
            } = req.body;


            // -----------------------------------------
            // VALIDATION
            // -----------------------------------------

            if (
                !userId ||
                !name ||
                !password
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Student ID, name and password are required"

                });

            }


            const cleanUserId =
                String(
                    userId
                ).trim();


            const cleanName =
                String(
                    name
                ).trim();


            const cleanEmail =
                email
                    ? String(email).trim()
                    : "";


            // -----------------------------------------
            // CHECK DUPLICATE STUDENT ID
            // -----------------------------------------

            const existingStudent =
                await User.findOne({

                    userId:
                        cleanUserId,

                    role:
                        "student"

                });


            if (existingStudent) {

                return res.status(409).json({

                    success: false,

                    message:
                        "A student with this Student ID already exists"

                });

            }


            // -----------------------------------------
            // HASH PASSWORD
            // -----------------------------------------

            const passwordHash =
                await bcrypt.hash(
                    password,
                    10
                );


            // -----------------------------------------
            // CREATE NEW STUDENT
            // -----------------------------------------

            const student =
                await User.create({

                    userId:
                        cleanUserId,

                    name:
                        cleanName,

                    email:
                        cleanEmail,

                    passwordHash,

                    role:
                        "student",

                    faceRegistered:
                        false,

                    faceImage:
                        null,

                    faceEmbedding:
                        null

                });


            return res.status(201).json({

                success: true,

                message:
                    "Student added successfully",

                student: {

                    _id:
                        student._id,

                    userId:
                        student.userId,

                    name:
                        student.name,

                    email:
                        student.email,

                    role:
                        student.role,

                    faceRegistered:
                        student.faceRegistered

                }

            });

        }

        catch (error) {

            console.log(
                "CREATE STUDENT ERROR:",
                error.message
            );


            if (
                error.code === 11000
            ) {

                return res.status(409).json({

                    success: false,

                    message:
                        "Student ID already exists"

                });

            }


            return res.status(500).json({

                success: false,

                message:
                    error.message

            });

        }

    }
);


// =====================================================
// UPLOAD / CHANGE STUDENT FACE
// =====================================================

router.post(
    "/:id/face",

    auth,
    adminOnly,

    upload.single(
        "faceImage"
    ),

    async function (req, res) {

        try {

            // -----------------------------------------
            // CHECK IMAGE
            // -----------------------------------------

            if (!req.file) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Face image is required"

                });

            }


            // -----------------------------------------
            // FIND STUDENT
            // -----------------------------------------

            const student =
                await User.findOne({

                    _id:
                        req.params.id,

                    role:
                        "student"

                });


            if (!student) {

                try {

                    fs.unlinkSync(
                        req.file.path
                    );

                }

                catch (error) {}


                return res.status(404).json({

                    success: false,

                    message:
                        "Student not found"

                });

            }


            // -----------------------------------------
            // DELETE OLD FACE IMAGE
            // -----------------------------------------

            if (
                student.faceImage
            ) {

                const oldImagePath =
                    path.resolve(
                        student.faceImage
                    );


                if (
                    fs.existsSync(
                        oldImagePath
                    )
                ) {

                    try {

                        fs.unlinkSync(
                            oldImagePath
                        );

                    }

                    catch (error) {

                        console.log(
                            "Old face delete error:",
                            error.message
                        );

                    }

                }

            }


            // -----------------------------------------
            // IMAGE PATH
            // -----------------------------------------

            const imagePath =
                req.file.path;


            // -----------------------------------------
            // READ IMAGE
            // -----------------------------------------

            const imageBuffer =
                fs.readFileSync(
                    imagePath
                );


            // -----------------------------------------
            // SEND IMAGE TO AI SERVICE
            // -----------------------------------------

            const axios =
                require("axios");

            const FormData =
                require("form-data");


            const formData =
                new FormData();


            formData.append(
                "image",
                imageBuffer,
                {

                    filename:
                        req.file.filename,

                    contentType:
                        req.file.mimetype

                }
            );


            let embedding;


            try {

                const aiResponse =
                    await axios.post(

                        "http://127.0.0.1:8000/process-face",

                        formData,

                        {

                            headers:
                                formData.getHeaders(),

                            maxBodyLength:
                                Infinity,

                            maxContentLength:
                                Infinity

                        }

                    );


                if (
                    !aiResponse.data ||
                    !aiResponse.data.success
                ) {

                    throw new Error(

                        aiResponse.data?.message ||
                        "Face processing failed"

                    );

                }


                embedding =
                    aiResponse.data.embedding;

            }

            catch (aiError) {

                try {

                    if (
                        fs.existsSync(
                            imagePath
                        )
                    ) {

                        fs.unlinkSync(
                            imagePath
                        );

                    }

                }

                catch (deleteError) {}


                return res.status(400).json({

                    success: false,

                    message:
                        aiError.response?.data?.message ||
                        aiError.message ||
                        "Face processing failed"

                });

            }


            // -----------------------------------------
            // SAVE FACE DATA
            // -----------------------------------------

            student.faceImage =
                imagePath;

            student.faceEmbedding =
                embedding;

            student.faceRegistered =
                true;


            await student.save();


            // -----------------------------------------
            // RESPONSE
            // -----------------------------------------

            return res.json({

                success: true,

                message:
                    "Face registered successfully",

                student: {

                    _id:
                        student._id,

                    userId:
                        student.userId,

                    name:
                        student.name,

                    faceRegistered:
                        student.faceRegistered

                }

            });

        }

        catch (error) {

            console.log(
                "FACE UPLOAD ERROR:",
                error.message
            );


            if (
                req.file &&
                req.file.path
            ) {

                try {

                    if (
                        fs.existsSync(
                            req.file.path
                        )
                    ) {

                        fs.unlinkSync(
                            req.file.path
                        );

                    }

                }

                catch (deleteError) {}

            }


            return res.status(500).json({

                success: false,

                message:
                    error.message

            });

        }

    }
);


// =====================================================
// CHANGE FACE STATUS
// =====================================================

router.patch(
    "/:id/face-status",

    auth,
    adminOnly,

    async function (req, res) {

        try {

            const {
                faceRegistered
            } = req.body;


            const student =
                await User.findOne({

                    _id:
                        req.params.id,

                    role:
                        "student"

                });


            if (!student) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Student not found"

                });

            }


            student.faceRegistered =
                Boolean(
                    faceRegistered
                );


            if (
                !student.faceRegistered
            ) {

                student.faceEmbedding =
                    null;

            }


            await student.save();


            return res.json({

                success: true,

                message:
                    "Face status updated",

                student

            });

        }

        catch (error) {

            console.log(
                "FACE STATUS ERROR:",
                error.message
            );


            return res.status(500).json({

                success: false,

                message:
                    error.message

            });

        }

    }
);


// =====================================================
// DELETE STUDENT
// =====================================================

router.delete(
    "/:id",

    auth,
    adminOnly,

    async function (req, res) {

        try {

            const id =
                req.params.id;


            // -----------------------------------------
            // FIND STUDENT
            // -----------------------------------------

            let student = null;


            // Try MongoDB _id first

            if (
                /^[0-9a-fA-F]{24}$/.test(
                    id
                )
            ) {

                student =
                    await User.findOne({

                        _id:
                            id,

                        role:
                            "student"

                    });

            }


            // Try Student ID

            if (!student) {

                student =
                    await User.findOne({

                        userId:
                            id,

                        role:
                            "student"

                    });

            }


            // -----------------------------------------
            // STUDENT NOT FOUND
            // -----------------------------------------

            if (!student) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Student not found"

                });

            }


            const studentId =
                student.userId;


            // -----------------------------------------
            // DELETE ATTENDANCE
            // -----------------------------------------

            const attendanceResult =
                await Attendance.deleteMany({

                    studentId:
                        studentId

                });


            console.log(
                `Deleted ${attendanceResult.deletedCount} attendance records for ${studentId}`
            );


            // -----------------------------------------
            // DELETE FACE IMAGE
            // -----------------------------------------

            if (
                student.faceImage
            ) {

                let facePath =
                    student.faceImage;


                if (
                    !path.isAbsolute(
                        facePath
                    )
                ) {

                    facePath =
                        path.resolve(
                            __dirname,
                            "..",
                            facePath
                        );

                }


                if (
                    fs.existsSync(
                        facePath
                    )
                ) {

                    try {

                        fs.unlinkSync(
                            facePath
                        );

                        console.log(
                            "Face image deleted:",
                            facePath
                        );

                    }

                    catch (error) {

                        console.log(
                            "Face image delete error:",
                            error.message
                        );

                    }

                }

            }


            // -----------------------------------------
            // DELETE USER
            // -----------------------------------------

            const deleteResult =
                await User.deleteOne({

                    _id:
                        student._id

                });


            if (
                deleteResult.deletedCount === 0
            ) {

                return res.status(500).json({

                    success: false,

                    message:
                        "Student could not be deleted"

                });

            }


            // -----------------------------------------
            // VERIFY USER DELETION
            // -----------------------------------------

            const checkStudent =
                await User.findOne({

                    userId:
                        studentId,

                    role:
                        "student"

                });


            if (checkStudent) {

                return res.status(500).json({

                    success: false,

                    message:
                        "Student still exists in database"

                });

            }


            // -----------------------------------------
            // VERIFY ATTENDANCE DELETION
            // -----------------------------------------

            const remainingAttendance =
                await Attendance.countDocuments({

                    studentId:
                        studentId

                });


            if (
                remainingAttendance > 0
            ) {

                return res.status(500).json({

                    success: false,

                    message:
                        "Student deleted but old attendance still exists"

                });

            }


            // -----------------------------------------
            // RESPONSE
            // -----------------------------------------

            return res.json({

                success: true,

                message:
                    `Student ${studentId} deleted successfully`,

                deletedStudentId:
                    studentId,

                deletedAttendance:
                    attendanceResult.deletedCount

            });

        }

        catch (error) {

            console.log(
                "DELETE STUDENT ERROR:",
                error.message
            );


            return res.status(500).json({

                success: false,

                message:
                    error.message

            });

        }

    }
);


module.exports = router;
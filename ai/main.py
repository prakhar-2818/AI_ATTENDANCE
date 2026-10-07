from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware

import cv2
import numpy as np
import mediapipe as mp


# =========================================================
# APP
# =========================================================

app = FastAPI()


# =========================================================
# CORS
# =========================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5500",
        "http://127.0.0.1:5500"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


# =========================================================
# MODELS
# =========================================================

MODEL_PATH = "models/face_recognition_sface_2021dec.onnx"


# Haar face detector
face_detector = cv2.CascadeClassifier(
    cv2.data.haarcascades +
    "haarcascade_frontalface_default.xml"
)


# SFace face recognition model
face_recognizer = cv2.FaceRecognizerSF.create(
    MODEL_PATH,
    ""
)


# =========================================================
# MEDIAPIPE FACE MESH
# =========================================================

mp_face_mesh = mp.solutions.face_mesh

face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=True,
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5
)


# =========================================================
# ROOT
# =========================================================

@app.get("/")
def root():

    return {
        "success": True,
        "message": "AI Face Attendance Server Running"
    }


# =========================================================
# HEALTH CHECK
# =========================================================

@app.get("/health")
def health():

    return {
        "success": True,
        "server": "running"
    }


# =========================================================
# DISTANCE
# =========================================================

def distance(p1, p2):

    return np.sqrt(
        (p1.x - p2.x) ** 2 +
        (p1.y - p2.y) ** 2
    )


# =========================================================
# EYE ASPECT RATIO
# =========================================================

def calculate_ear(landmarks, eye):

    p1 = landmarks[eye[0]]
    p2 = landmarks[eye[1]]
    p3 = landmarks[eye[2]]
    p4 = landmarks[eye[3]]
    p5 = landmarks[eye[4]]
    p6 = landmarks[eye[5]]

    vertical1 = distance(p2, p6)
    vertical2 = distance(p3, p5)

    horizontal = distance(p1, p4)

    if horizontal == 0:
        return 0

    return (
        vertical1 + vertical2
    ) / (
        2 * horizontal
    )


# =========================================================
# HEAD MOVEMENT RATIO
# =========================================================

def calculate_head_ratio(landmarks):

    nose = landmarks[1]

    left_eye = landmarks[33]
    right_eye = landmarks[263]

    eye_center_x = (
        left_eye.x +
        right_eye.x
    ) / 2

    eye_distance = abs(
        right_eye.x -
        left_eye.x
    )

    if eye_distance == 0:
        return 0

    return (
        nose.x -
        eye_center_x
    ) / eye_distance


# =========================================================
# PROCESS FACE
# =========================================================

@app.post("/process-face")
async def process_face(
    image: UploadFile = File(...)
):

    try:

        # -------------------------------------------------
        # Read image
        # -------------------------------------------------

        image_bytes = await image.read()

        image_array = np.frombuffer(
            image_bytes,
            dtype=np.uint8
        )

        img = cv2.imdecode(
            image_array,
            cv2.IMREAD_COLOR
        )

        if img is None:

            return {
                "success": False,
                "message": "Invalid image"
            }


        # -------------------------------------------------
        # Detect face
        # -------------------------------------------------

        gray = cv2.cvtColor(
            img,
            cv2.COLOR_BGR2GRAY
        )

        faces = face_detector.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(80, 80)
        )


        if len(faces) == 0:

            return {
                "success": False,
                "message": "No face detected"
            }


        if len(faces) > 1:

            return {
                "success": False,
                "message": "Multiple faces detected"
            }


        # -------------------------------------------------
        # Get face
        # -------------------------------------------------

        x, y, w, h = faces[0]

        face = img[
            y:y + h,
            x:x + w
        ]


        if face.size == 0:

            return {
                "success": False,
                "message": "Invalid face crop"
            }


        # -------------------------------------------------
        # Resize
        # -------------------------------------------------

        face = cv2.resize(
            face,
            (112, 112)
        )


        # -------------------------------------------------
        # Generate SFace embedding
        # -------------------------------------------------

        embedding = face_recognizer.feature(
            face
        )


        if embedding is None:

            return {
                "success": False,
                "message": "Face embedding failed"
            }


        embedding = embedding.flatten().tolist()


        # -------------------------------------------------
        # Response
        # -------------------------------------------------

        return {

            "success": True,

            "message": "Face processed successfully",

            "embedding": embedding,

            "embeddingLength": len(embedding)
        }


    except Exception as e:

        print(
            "PROCESS FACE ERROR:",
            str(e)
        )

        return {

            "success": False,

            "message": str(e)
        }


# =========================================================
# LIVENESS
# =========================================================

@app.post("/liveness")
async def liveness(
    images: list[UploadFile] = File(...),
    action: str = Form(...)
):

    try:

        # -------------------------------------------------
        # Minimum frames
        # -------------------------------------------------

        if len(images) < 5:

            return {

                "success": False,

                "passed": False,

                "message": "Not enough frames"
            }


        ear_values = []

        head_values = []

        face_detected_count = 0


        # =================================================
        # PROCESS EVERY FRAME
        # =================================================

        for image in images:

            # IMPORTANT:
            # Keep this line exactly like this

            image_bytes = await image.read()


            image_array = np.frombuffer(
                image_bytes,
                dtype=np.uint8
            )


            img = cv2.imdecode(
                image_array,
                cv2.IMREAD_COLOR
            )


            if img is None:
                continue


            # ------------------------------------------------
            # Convert BGR -> RGB
            # ------------------------------------------------

            rgb = cv2.cvtColor(
                img,
                cv2.COLOR_BGR2RGB
            )


            # ------------------------------------------------
            # MediaPipe Face Mesh
            # ------------------------------------------------

            result = face_mesh.process(
                rgb
            )


            if not result.multi_face_landmarks:

                continue


            # Only one face allowed

            if len(
                result.multi_face_landmarks
            ) != 1:

                continue


            face_landmarks = (
                result.multi_face_landmarks[0]
            )


            landmarks = (
                face_landmarks.landmark
            )


            face_detected_count += 1


            # =================================================
            # EYES
            # =================================================

            left_eye = [
                33,
                160,
                158,
                133,
                153,
                144
            ]


            right_eye = [
                362,
                385,
                387,
                263,
                373,
                380
            ]


            # ------------------------------------------------
            # Calculate EAR
            # ------------------------------------------------

            left_ear = calculate_ear(
                landmarks,
                left_eye
            )


            right_ear = calculate_ear(
                landmarks,
                right_eye
            )


            ear = (
                left_ear +
                right_ear
            ) / 2


            ear_values.append(
                ear
            )


            # =================================================
            # HEAD
            # =================================================

            head_ratio = calculate_head_ratio(
                landmarks
            )


            head_values.append(
                head_ratio
            )


        # =================================================
        # FACE DETECTION CHECK
        # =================================================

        if face_detected_count < 3:

            return {

                "success": True,

                "passed": False,

                "message":
                    "Face not continuously detected"
            }


        # =================================================
        # BLINK
        # =================================================

        if action == "blink":

            minimum_ear = min(
                ear_values
            )

            maximum_ear = max(
                ear_values
            )


            # EASY BLINK THRESHOLD

            blink_detected = (

                minimum_ear < 0.22

                and

                maximum_ear > 0.22
            )


            if blink_detected:

                return {

                    "success": True,

                    "passed": True,

                    "action": "blink",

                    "message":
                        "Blink detected"
                }


            return {

                "success": True,

                "passed": False,

                "action": "blink",

                "message":
                    "Blink not detected. Blink once."
            }


        # =================================================
        # LEFT
        # =================================================

        if action == "left":

            minimum_ratio = min(
                head_values
            )


            # EASY LEFT THRESHOLD

            if minimum_ratio < -0.04:

                return {

                    "success": True,

                    "passed": True,

                    "action": "left",

                    "message":
                        "Left movement detected"
                }


            return {

                "success": True,

                "passed": False,

                "action": "left",

                "message":
                    "Turn your head LEFT"
            }


        # =================================================
        # RIGHT
        # =================================================

        if action == "right":

            maximum_ratio = max(
                head_values
            )


            # EASY RIGHT THRESHOLD

            if maximum_ratio > 0.04:

                return {

                    "success": True,

                    "passed": True,

                    "action": "right",

                    "message":
                        "Right movement detected"
                }


            return {

                "success": True,

                "passed": False,

                "action": "right",

                "message":
                    "Turn your head RIGHT"
            }


        # =================================================
        # INVALID ACTION
        # =================================================

        return {

            "success": False,

            "passed": False,

            "message":
                "Invalid liveness action"
        }


    except Exception as e:

        print(
            "LIVENESS ERROR:",
            str(e)
        )


        return {

            "success": False,

            "passed": False,

            "message": str(e)
        }
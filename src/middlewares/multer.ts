import multer from "multer";

export const singleUpload = multer().single("photo");
export const multiUpload = multer().array("photo", 5);

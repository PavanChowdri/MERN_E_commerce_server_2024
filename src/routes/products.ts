import express from "express";
import { adminOnly } from "../middlewares/auth.js";
import {
  deleteProduct,
  getAdminProducts,
  getAllCategories,
  getlatestProduct,
  getSingleProduct,
  newProduct,
  searchAllProducts,
  updateProduct,
} from "../controllers/product.js";
import { singleUpload,multiUpload } from "../middlewares/multer.js";

const app = express.Router();

//To Create New Product -/api/v1/product/new
app.post("/new", adminOnly, multiUpload, newProduct);

// get searched products with filter - /api/v1/product/all
app.get("/all", searchAllProducts);

//To get latest products -/api/v1/product/latest
app.get("/latest", getlatestProduct);

//get all categories -/api/v1/product/categories
app.get("/categories", getAllCategories);

// get all products list -/api/v1/product/admin-products
app.get("/admin-products", getAdminProducts);

app.route("/:id").get(getSingleProduct).delete(deleteProduct);

app.put("/:id", multiUpload, updateProduct);

export default app;

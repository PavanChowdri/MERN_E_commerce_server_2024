import { NextFunction, Request, Response } from "express";
import { TryCatch } from "../middlewares/error.js";
import { Product } from "../models/product.js";
import {
  BaseQuery,
  NewProductRequestBody,
  SearchRequestQuery,
} from "../types/types.js";
import ErrorHandler from "../utils/utility-class.js";
import { rm } from "fs";
import { myCache } from "../app.js";
import {
  DeleteFromCloudinary,
  invalidateCache,
  UploadToCloudinary,
} from "../utils/features.js";
import mongoose from "mongoose";
// import { faker } from "@faker-js/faker";

// Revalidate on New, update ,delete product & on new order
export const getlatestProduct = TryCatch(
  async (req: Request, res: Response, next: NextFunction) => {
    let products;

    if (myCache.has("latest-products"))
      products = JSON.parse(myCache.get("latest-products") as string);
    else {
      products = await Product.find({}).sort({ createdAt: -1 }).limit(5);
      myCache.set("latest-products", JSON.stringify(products));
    }

    return res.status(200).json({
      success: true,
      products,
    });
  }
);

// Revalidate on New, update ,delete product & on new order
export const getAllCategories = TryCatch(
  async (req: Request, res: Response, next: NextFunction) => {
    let categories;
    if (myCache.has("categories"))
      categories = JSON.parse(myCache.get("categories") as string);
    else {
      categories = await Product.distinct("category");
      myCache.set("categories", JSON.stringify(categories));
    }

    return res.status(200).json({
      success: true,
      categories,
    });
  }
);

// Revalidate on New, update ,delete product & on new order
export const getAdminProducts = TryCatch(
  async (req: Request, res: Response, next: NextFunction) => {
    let products;
    if (myCache.has("all-products"))
      products = JSON.parse(myCache.get("all-products") as string);
    else {
      products = await Product.find({});
      myCache.set("all-products", JSON.stringify(products));
    }

    return res.status(200).json({
      success: true,
      products,
    });
  }
);

export const getSingleProduct = TryCatch(async (req, res, next) => {
  let products;
  const id = req.params.id;
  if (myCache.has(`product-${id}`)) {
    products = JSON.parse(myCache.get(`product-${id}`) as string);
  } else {
    products = await Product.findById(id);
    if (!products) return next(new ErrorHandler("Product Not Found", 404));

    myCache.set(`product-${id}`, JSON.stringify(products));
  }
  return res.status(200).json({
    success: true,
    products,
  });
});

export const newProduct = TryCatch(
  async (
    req: Request<{}, {}, NewProductRequestBody>,
    res: Response,
    next: NextFunction
  ) => {
    const { name, price, stock, category } = req.body;
    const photo = req.files as Express.Multer.File[] | undefined;

    if (!photo) return next(new ErrorHandler("Please Add Photo", 400));

    if (photo.length < 1)
      return next(new ErrorHandler("Please add atleast one Photo", 400));

    if (photo.length > 5)
      return next(new ErrorHandler("You can only upload 5 Photos", 400));

    if (!name || !price || !stock || !category) {
      return next(new ErrorHandler("Please enter all fields", 400));
    }

    const photoURL = await UploadToCloudinary(photo);

    await Product.create({
      name,
      photo: photoURL,
      price,
      stock,
      category: category.toLowerCase(),
    });

    console.log("Uploaded to cloudinary");
    invalidateCache({ products: true, admin: true });

    return res.status(201).json({
      success: true,
      message: "Product created successfully",
    });
  }
);

export const updateProduct = TryCatch(async (req, res, next) => {
  const { id } = req.params;
  const { name, price, stock, category, description } = req.body;
  const photos = req.files as Express.Multer.File[] | undefined;

  const product = await Product.findById(id);

  if (!product) return next(new ErrorHandler("Product Not Found", 404));

  if (photos && photos.length > 0) {
    const photosURL = await UploadToCloudinary(photos);

    const ids = product.photo.map((photo) => photo.public_id);

    await DeleteFromCloudinary(ids);

    product.set("photo", photosURL);
  }

  if (name) product.name = name;
  if (price) product.price = price;
  if (stock) product.stock = stock;
  if (category) product.category = category;

  await product.save();

  invalidateCache({
    products: true,
    productId: String(product._id),
    admin: true,
  });

  return res.status(200).json({
    success: true,
    message: "Product Updated Successfully",
  });
});

export const deleteProduct = TryCatch(async (req, res, next) => {
  const product = await Product.findById(req.params.id);
  if (!product) return next(new ErrorHandler("Product Not Found", 404));

  const ids = product.photo.map((photo) => photo.public_id);

  await DeleteFromCloudinary(ids);

  await product.deleteOne();

  invalidateCache({
    products: true,
    productId: String(product._id),
    admin: true,
  });

  return res.status(200).json({
    success: true,
    message: "Product Deleted Successfully",
  });
});

export const searchAllProducts = TryCatch(
  async (
    req: Request<{}, {}, {}, SearchRequestQuery>,
    res: Response,
    next: NextFunction
  ) => {
    const { search, sort, category, price } = req.query;
    const page = Number(req.query.page) || 1;

    const limit = Number(process.env.PRODUCT_PER_PAGE) || 8;
    const skip = (page - 1) * limit;

    const baseQuery: BaseQuery = {};

    // price: {
    //   $lte: Number(price),
    // },
    // category,

    if (search)
      baseQuery.name = {
        $regex: search, // check for pattern
        $options: "i", // handling case sensitive
      };

    if (price)
      baseQuery.price = {
        $lte: Number(price),
      };

    if (category) baseQuery.category = category;

    const productsPromise = Product.find(baseQuery)
      .sort(sort && { price: sort === "asc" ? 1 : -1 })
      .limit(limit)
      .skip(skip);

    const [products, filteredOnlyProduct] = await Promise.all([
      productsPromise,
      Product.find(baseQuery),
    ]);

    /* 2 await concurrently one after the other is good but not efficient so using promise all

    /* const products = await Product.find(baseQuery)
       .sort(sort && { price: sort === "asc" ? 1 : -1 })
      .limit(limit)
     .skip(skip);
     const filteredOnlyProduct = await Product.find(baseQuery);*/

    const totalPage = Math.ceil(filteredOnlyProduct.length / limit); // ceil: opp of floor suppose there are 101 items and 10 is limit then other 1 item should be in next page, so ceil is used here.

    return res.status(200).json({
      success: true,
      products,
      totalPage,
    });
  }
);

// const generateRnadomProducts = async (count: number = 10) => {
//   const products = [];

//   for (let i = 0; i < count; i++) {
//     const product = {
//       name: faker.commerce.productName(),
//       photo: "uploads\\f01fc37f-229e-4ad7-83d6-c0efc189a724.jpg",
//       price: faker.commerce.price({ min: 1500, max: 80000, dec: 0 }),
//       stock: faker.commerce.price({ min: 0, max: 100, dec: 0 }),
//       category: faker.commerce.department(),
//       createdAt: new Date(faker.date.past()),
//       updatedAt: new Date(faker.date.recent()),
//       __v: 0,
//     };
//     products.push(product);
//   }
//   await Product.create(products);
//   console.log({ success: true });
// };

// const deleteRandomProducts = async (count: number = 10) => {
//   const products = await Product.find({}).skip(2);

//   for (let i = 0; i < products.length; i++) {
//     const product = products[i];
//     await product.deleteOne();
//   }

//   console.log({ success: true });
// };

// deleteRandomProducts(1);

import mongoose, { Document } from "mongoose";
import { invalidateCacheProps, OrderItemType } from "../types/types.js";
import { myCache } from "../app.js";
import { Product } from "../models/product.js";
import { UploadApiResponse, v2 as cloudinary } from "cloudinary";
import { Stream } from "stream";
import { Order } from "../models/order.js";
import { error } from "console";
import { url } from "inspector";
export const connectDB = (url: string) => {
  mongoose
    .connect(url, {
      dbName: "ECOMMERCE_24",
    })
    .then((c) => console.log(`DB Connected to ${c.connection.host}`))
    .catch((e) => console.log(e));
};

export const invalidateCache = ({
  products,
  order,
  admin,
  userId,
  orderId,
  productId,
}: invalidateCacheProps) => {
  if (products) {
    const productKeys: string[] = [
      "latest-products",
      "categories",
      "all-products",
    ];

    if (typeof productId === "string") productKeys.push(`product-${productId}`);
    if (typeof productId === "object") {
      productId.forEach((i) => productKeys.push(`product-${i}`));
    }

    myCache.del(productKeys);
  }
  if (order) {
    const ordersKeys: string[] = [
      "all-orders",
      `my-orders-${userId}`,
      `order-${orderId}`,
    ];

    myCache.del(ordersKeys);
  }
  if (admin) {
    myCache.del([
      "admin-stats",
      "admin-pie-charts",
      "admin-bar-charts",
      "admin-line-charts",
    ]);
  }
};

export const reduceStock = async (OrderItems: OrderItemType[]) => {
  for (let i = 0; i < OrderItems.length; i++) {
    const order = OrderItems[i];
    const product = await Product.findById(order.productId);
    if (!product) throw new Error("Product Not Found");
    product.stock -= order.quantity;
    await product.save();
  }
};

export const calculatePercentage = (thisMonth: number, lastMonth: number) => {
  if (lastMonth === 0) return thisMonth * 100;
  const percent = (thisMonth / lastMonth) * 100;
  return Number(percent.toFixed(0));
};

export const getInventories = async ({
  categories,
  productsCount,
}: {
  categories: string[];
  productsCount: number;
}) => {
  const categoriesCount = await Promise.all(
    categories.map((category) => Product.countDocuments({ category }))
  );

  const categoryCount: Record<string, number>[] = [];

  categories.forEach((category, i) => {
    categoryCount.push({
      [category]: Math.round((categoriesCount[i] / productsCount) * 100),
    });
  });

  return categoryCount;
};

interface MyDocument extends Document {
  createdAt: Date;
  updatedAt: Date;
  discount?: number;
  total?: number;
}
export type FuncProps = {
  length: number;
  docArr: MyDocument[];
  today: Date;
  property?: "discount" | "total";
};

export const getChartData = ({
  length,
  docArr,
  today,
  property,
}: FuncProps) => {
  const data: number[] = new Array(length).fill(0);

  docArr.forEach((i) => {
    const creationDate = i.createdAt;
    const monthDiff = (today.getMonth() - creationDate.getMonth() + 12) % 12;

    if (monthDiff < length) {
      if (property) {
        data[length - monthDiff - 1] += i[property]!;
      } else {
        data[length - monthDiff - 1] += 1;
      }
    }
  });

  return data;
};

const getBase64 = (file: Express.Multer.File) =>
  `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;

const streamUpload = (
  buffer: Buffer,
  options = {}
): Promise<UploadApiResponse> => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      options,
      (error, result) => {
        if (result) {
          resolve(result);
        } else {
          reject(error);
        }
      }
    );
    const bufferStream = new Stream.PassThrough();
    bufferStream.end(buffer);
    bufferStream.pipe(stream);
  });
};

export const UploadToCloudinary = async (files: Express.Multer.File[]) => {
  const promises = files.map(async (file) => {
    return streamUpload(file.buffer, { folder: "upload" }); // Specify folder here if needed
  });

  const result = await Promise.all(promises);

  return result.map((i) => ({
    public_id: i.public_id,
    url: i.secure_url,
  }));
};

export const DeleteFromCloudinary = async (publicIds: string[]) => {
  const promises = publicIds.map((id) => cloudinary.uploader.destroy(id));

  const results = await Promise.allSettled(promises);

  const deleted = results.filter((result) => result.status === "fulfilled");
  const failed = results.filter((result) => result.status === "rejected");

  return {
    deleted: deleted.length,
    failed: failed.length,
    errors: failed.map((result) => (result as PromiseRejectedResult).reason),
  };
};

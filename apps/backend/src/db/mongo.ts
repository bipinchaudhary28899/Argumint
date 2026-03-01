import mongoose from "mongoose";

let mongoConnected = false;

export const connectMongo = async (uri: string) => {
  try {
    await mongoose.connect(uri);
    mongoConnected = true;
    console.log("MongoDB connected");
  } catch (error) {
    mongoConnected = false;
    console.error("MongoDB connection failed:", error);
  }
};

export const isMongoConnected = () => mongoConnected;
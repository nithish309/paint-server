import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import path from "path";
import fs from "fs"; // Import fs module for file operations
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.urlencoded({ extended: true }));

// Ensure the uploads directory exists
if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
  fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });
}

// Serve static files for uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB connection (replace with your URI if needed for testing)
const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/yourdbname";

mongoose
  .connect(uri)
  .then(() => {
    console.log("MongoDB connected");
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });

// Define a schema
const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  description: { type: String, required: true },
  image: { type: String } // Image URL
});

const productModel = mongoose.model("products", productSchema);

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ storage: storage });

// Route to create a new product with an image
app.post("/products", upload.single("image"), async (req, res) => {
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

  const newProduct = new productModel({
    name: req.body.name,
    price: req.body.price,
    description: req.body.description,
    image: imageUrl,
  });

  try {
    const savedProduct = await newProduct.save();
    res.status(200).json(savedProduct);
  } catch (error) {
    console.error("Error saving product:", error);
    res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
});

// Route to get all products with absolute image URLs
app.get("/products", async (req, res) => {
  try {
    const products = await productModel.find();
    const productsWithAbsoluteUrls = products.map(product => ({
      ...product._doc,
      image: product.image ? `${req.protocol}://${req.get('host')}${product.image}` : null
    }));
    res.status(200).json(productsWithAbsoluteUrls);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
});

// Route to update a product
app.put("/products/:id", upload.single("image"), async (req, res) => {
  try {
    const updatedData = {
      name: req.body.name,
      price: req.body.price,
      description: req.body.description,
    };

    // If a new image is provided, update the image URL and delete the old image
    if (req.file) {
      const product = await productModel.findById(req.params.id);
      if (product && product.image) {
        const oldImagePath = path.join(__dirname, product.image);
        fs.unlink(oldImagePath, (err) => {
          if (err) {
            console.error("Error deleting old image:", err);
          }
        });
      }
      updatedData.image = `/uploads/${req.file.filename}`;
    }

    const updatedProduct = await productModel.findByIdAndUpdate(
      req.params.id,
      updatedData,
      { new: true }
    );

    if (!updatedProduct) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Return the updated product with an absolute URL for the image
    const updatedProductWithAbsoluteUrl = {
      ...updatedProduct._doc,
      image: updatedProduct.image ? `${req.protocol}://${req.get('host')}${updatedProduct.image}` : null
    };
    res.status(200).json(updatedProductWithAbsoluteUrl);
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
});

// Route to delete a product
app.delete("/products/:id", async (req, res) => {
  try {
    const product = await productModel.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Delete the associated image file
    if (product.image) {
      const imagePath = path.join(__dirname, product.image);
      fs.unlink(imagePath, (err) => {
        if (err) {
          console.error("Error deleting image:", err);
        }
      });
    }

    await productModel.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Product deleted successfully" });
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

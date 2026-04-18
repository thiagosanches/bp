# Ecommerce Order Frontend

A simple Vue 3 + Vite web frontend to queue ecommerce order/payment requests via the FastAPI backend.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Run the development server:
   ```bash
   npm run dev
   ```

The frontend will be available at http://localhost:5173 and will proxy API requests to http://localhost:8000/order.

## Features
- Submit product link and order details
- Queue order/payment process
- View result or error from backend

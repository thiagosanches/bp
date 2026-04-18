# Frontend Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json .
COPY index.html .
COPY simple.html .
COPY src ./src
COPY vite.config.js .
RUN npm install && npm run build
EXPOSE 5173
CMD ["npx", "vite", "preview", "--host", "0.0.0.0"]

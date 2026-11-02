# ---- build stage: install everything, build the React app ----
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- runtime stage: one process serves the API and the built frontend ----
FROM node:22-slim
ENV NODE_ENV=production PORT=4000
WORKDIR /app
COPY --from=build /app .
EXPOSE 4000
# JWT_SECRET (required) and OPENAI_API_KEY are supplied at runtime, never baked into the image.
CMD ["npm", "start"]

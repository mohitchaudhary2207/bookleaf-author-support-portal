# ---- build stage: install everything (incl. dev dependencies: vite), build the React app ----
FROM node:22-slim AS build
WORKDIR /app
# NODE_ENV is deliberately NOT set in this stage so devDependencies (vite) are installed for the build.
# Set to "true" only for an isolated evaluation image: it embeds the demo passwords in the frontend bundle.
ARG VITE_SHOW_DEMO=false
ENV VITE_SHOW_DEMO=$VITE_SHOW_DEMO
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --include=dev
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- runtime stage: one process serves the API and the built frontend ----
FROM node:22-slim
ENV NODE_ENV=production PORT=4000
WORKDIR /app
COPY --from=build /app .
EXPOSE 4000
# Runtime configuration (never baked into the image): JWT_SECRET (required), OPENAI_API_KEY (optional),
# and - only for an isolated demo - SEED_DEMO_DATA=true with SEED_AUTHOR_PASSWORD / SEED_ADMIN_PASSWORD.
CMD ["npm", "start"]

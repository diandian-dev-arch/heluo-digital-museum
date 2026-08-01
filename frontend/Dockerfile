# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
# The container build does not execute dependency lifecycle scripts. Vite's
# production bundle is built with the checked-in lockfile and its native
# optional packages.
RUN pnpm install --frozen-lockfile --ignore-scripts --node-linker=hoisted
COPY . .
ENV CI=true
# CI runs vue-tsc separately. Keep the image build focused on the production
# bundle so a registry-side vue-tsc package issue cannot block containerization.
RUN ./node_modules/.bin/vite build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

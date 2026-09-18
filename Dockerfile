# syntax=docker/dockerfile:1
FROM node:22-alpine AS frontend-build
WORKDIR /workspace/frontend
RUN corepack enable
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts --node-linker=hoisted
COPY frontend/ ./
ENV CI=true
RUN ./node_modules/.bin/vite build

FROM maven:3.9-eclipse-temurin-17 AS backend-build
WORKDIR /workspace/backend
COPY backend/pom.xml ./
COPY backend/src ./src
COPY --from=frontend-build /workspace/frontend/dist ./src/main/resources/static
RUN mvn -q -DskipTests package

FROM eclipse-temurin:17-jre
WORKDIR /app
RUN addgroup --system museum \
    && adduser --system --ingroup museum museum \
    && mkdir -p /data \
    && chown -R museum:museum /app /data
COPY --from=backend-build --chown=museum:museum /workspace/backend/target/museum-api-*.jar /app/app.jar
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 755 /usr/local/bin/docker-entrypoint.sh
ENV SPRING_PROFILES_ACTIVE=pocketbay
ENV SPRING_CONFIG_IMPORT=optional:file:/app/pocketbay.properties
EXPOSE 8080
ENTRYPOINT ["docker-entrypoint.sh"]

# syntax=docker/dockerfile:1
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /workspace
COPY pom.xml ./
RUN mvn -q -DskipTests dependency:go-offline
COPY src ./src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:17-jre
WORKDIR /app
RUN addgroup --system museum && adduser --system --ingroup museum museum
COPY --from=build /workspace/target/museum-api-*.jar app.jar
USER museum
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]

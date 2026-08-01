# 后端工程

Spring Boot 3（Java 17）API 骨架，采用 MySQL + Flyway 的生产配置，以及 H2 的隔离测试配置。

```powershell
mvn test
mvn spring-boot:run
```

本阶段开放 `/api/v1/health`；认证、权限和业务接口将在对应 Flyway 数据表与领域实现完成后逐步接入。

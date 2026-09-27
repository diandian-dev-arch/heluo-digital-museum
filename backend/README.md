# 后端工程

Spring Boot 3（Java 17）API，采用 MySQL + Flyway 的完整业务配置，以及 H2 的隔离测试/本地演示配置。

```powershell
mvn test
mvn spring-boot:run
```

`/api/v1/health` 用于存活检查；`/api/v1/ready` 检查数据库就绪，失败返回 503。认证、内容、3D 元数据、预约、购物车、订单、模拟支付与后台业务已实现；接口与权限以 `docs/05-api-design.md` 为准。

邮件采用事务提交后异步通知，2 个线程、最多 100 个排队任务，SMTP 连接/读/写各 5 秒超时。进程退出、发送失败或队列满时仅保留带请求编号的失败日志，没有持久化补发机制。隔离质量环境默认不启用 SMTP。

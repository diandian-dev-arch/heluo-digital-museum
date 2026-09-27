package com.heluo.museum;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.heluo.museum.store.OrderExpiryJob;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=test",
        "spring.datasource.url=jdbc:h2:mem:museum-quality;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE",
        "museum.orders.expiry-initial-delay-ms=3600000"
})
class SitewideQualityTests {
    @Autowired private TestRestTemplate client;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ObjectMapper mapper;
    @Autowired private OrderExpiryJob expiryJob;

    @DynamicPropertySource
    static void isolatedMysqlWhenRequested(DynamicPropertyRegistry registry) {
        String password = System.getenv("HELUO_MIGRATION_MYSQL_PASSWORD");
        if (password == null) return;
        String database = "museum_quality_test_" + UUID.randomUUID().toString().replace("-", "");
        registry.add("spring.datasource.url", () -> "jdbc:mysql://127.0.0.1:13306/" + database
                + "?createDatabaseIfNotExist=true&useUnicode=true&characterEncoding=utf8&serverTimezone=UTC&useSSL=false&allowPublicKeyRetrieval=true");
        registry.add("spring.datasource.username", () -> "root");
        registry.add("spring.datasource.password", () -> password);
        registry.add("spring.datasource.driver-class-name", () -> "com.mysql.cj.jdbc.Driver");
    }

    @Test
    void expiryScanPaymentAndUserCancellationCannotReleaseReservedStockTwice() throws Exception {
        var account = account();
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 24);
        jdbc.update("insert into products(sku,name,slug,price,stock_quantity,locked_stock,status,created_by,updated_by) "
                + "values(?,?,?,10,5,3,'PUBLISHED',?,?)", suffix, "Expiry race", suffix, account.id(), account.id());
        long productId = jdbc.queryForObject("select id from products where sku=?", Long.class, suffix);
        // One reserved unit belongs to another still-valid order. Double release must not consume it.
        jdbc.update("insert into orders(order_no,user_id,payable_amount,notification_email,expires_at,status_updated_by) "
                + "values(?,?,20,'quality@example.test',?,?)", suffix, account.id(),
                Timestamp.from(Instant.now().minusSeconds(5)), account.id());
        long orderId = jdbc.queryForObject("select id from orders where order_no=?", Long.class, suffix);
        jdbc.update("insert into order_items(order_id,product_id,product_sku_snapshot,product_name_snapshot,unit_price,quantity,subtotal_amount) "
                + "values(?,?,?,?,10,2,20)", orderId, productId, suffix, "Expiry race");
        jdbc.update("insert into orders(order_no,user_id,payable_amount,notification_email,expires_at,status_updated_by) "
                + "values(?,?,10,'quality@example.test',?,?)", suffix + "-valid", account.id(),
                Timestamp.from(Instant.now().plusSeconds(1800)), account.id());
        long validId = jdbc.queryForObject("select id from orders where order_no=?", Long.class, suffix + "-valid");
        jdbc.update("insert into order_items(order_id,product_id,product_sku_snapshot,product_name_snapshot,unit_price,quantity,subtotal_amount) "
                + "values(?,?,?,?,10,1,10)", validId, productId, suffix, "Still reserved");
        account.headers().set("Idempotency-Key", suffix);
        var executor = Executors.newFixedThreadPool(3);
        var start = new CountDownLatch(1);
        try {
            var expiry = executor.submit(() -> { start.await(); expiryJob.cancelExpiredOrders(); return true; });
            var payment = executor.submit(() -> { start.await(); return client.postForEntity(
                    "/api/v1/orders/" + orderId + "/mock-payment", new HttpEntity<>(account.headers()), String.class).getStatusCode(); });
            var cancellation = executor.submit(() -> { start.await(); return client.postForEntity(
                    "/api/v1/orders/" + orderId + "/cancel", new HttpEntity<>(account.headers()), String.class).getStatusCode(); });
            start.countDown();
            assertThat(expiry.get(15, TimeUnit.SECONDS)).isTrue();
            assertThat(payment.get(15, TimeUnit.SECONDS)).isEqualTo(HttpStatus.CONFLICT);
            assertThat(cancellation.get(15, TimeUnit.SECONDS)).isIn(HttpStatus.OK, HttpStatus.CONFLICT);
        } finally {
            executor.shutdownNow();
        }
        expiryJob.cancelExpiredOrders();
        assertThat(jdbc.queryForObject("select status from orders where id=?", String.class, orderId)).isEqualTo("CANCELLED");
        assertThat(jdbc.queryForObject("select status from orders where id=?", String.class, validId)).isEqualTo("PENDING_PAYMENT");
        assertThat(jdbc.queryForObject("select locked_stock from products where id=?", Integer.class, productId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select stock_quantity from products where id=?", Integer.class, productId)).isEqualTo(5);
        assertThat(jdbc.queryForObject("select count(*) from payment_transactions where order_id=?", Integer.class, orderId)).isZero();
    }

    @Test
    void expiredPaymentCommitsCancellationAndReleasesStockBeforeReturningConflict() throws Exception {
        var account = account();
        String suffix = UUID.randomUUID().toString().replace("-", "");
        jdbc.update("insert into products(sku,name,slug,price,stock_quantity,locked_stock,status,created_by,updated_by) "
                + "values(?,?,?,10,5,2,'PUBLISHED',?,?)", suffix, "Quality product", suffix, account.id(), account.id());
        long productId = jdbc.queryForObject("select id from products where sku=?", Long.class, suffix);
        jdbc.update("insert into orders(order_no,user_id,payable_amount,notification_email,expires_at,status_updated_by) "
                + "values(?,?,20,'quality@example.test',?,?)", suffix, account.id(),
                Timestamp.from(Instant.now().minusSeconds(1)), account.id());
        long orderId = jdbc.queryForObject("select id from orders where order_no=?", Long.class, suffix);
        jdbc.update("insert into order_items(order_id,product_id,product_sku_snapshot,product_name_snapshot,unit_price,quantity,subtotal_amount) "
                + "values(?,?,?,?,10,2,20)", orderId, productId, suffix, "Quality product");
        account.headers().set("Idempotency-Key", suffix);

        var response = client.postForEntity("/api/v1/orders/" + orderId + "/mock-payment",
                new HttpEntity<>(account.headers()), String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(jdbc.queryForObject("select status from orders where id=?", String.class, orderId)).isEqualTo("CANCELLED");
        assertThat(jdbc.queryForObject("select locked_stock from products where id=?", Integer.class, productId)).isZero();
        assertThat(jdbc.queryForObject("select stock_quantity from products where id=?", Integer.class, productId)).isEqualTo(5);
        assertThat(jdbc.queryForObject("select count(*) from payment_transactions where order_id=?", Integer.class, orderId)).isZero();
        var retry = client.postForEntity("/api/v1/orders/" + orderId + "/mock-payment",
                new HttpEntity<>(account.headers()), String.class);
        assertThat(retry.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(jdbc.queryForObject("select locked_stock from products where id=?", Integer.class, productId)).isZero();
    }

    @Test
    void passwordResetTokenCanOnlyBeConsumedByOneConcurrentRequest() throws Exception {
        var account = account();
        String token = UUID.randomUUID().toString();
        String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8)));
        jdbc.update("insert into password_reset_tokens(id,user_id,token_hash,expires_at) values(?,?,?,?)",
                UUID.randomUUID().toString(), account.id(), hash, Timestamp.from(Instant.now().plusSeconds(300)));
        var executor = Executors.newFixedThreadPool(2);
        var start = new CountDownLatch(1);
        try {
            var requests = List.of("FirstPassword123", "SecondPassword123").stream().map(password -> executor.submit(() -> {
                start.await();
                return client.postForEntity("/api/v1/auth/password-reset/confirm",
                        Map.of("resetToken", token, "newPassword", password), String.class).getStatusCode();
            })).toList();
            start.countDown();
            assertThat(List.of(requests.get(0).get(10, TimeUnit.SECONDS), requests.get(1).get(10, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(HttpStatus.OK, HttpStatus.NOT_FOUND);
            assertThat(jdbc.queryForObject("select count(*) from auth_sessions where user_id=? and revoked_at is null",
                    Integer.class, account.id())).isZero();
        } finally {
            executor.shutdownNow();
        }
    }

    @Test
    void requestIdsAreUniqueAndMatchSuccessValidationAndSecurityEnvelopes() throws Exception {
        HttpHeaders headers = new HttpHeaders();
        headers.set("X-Request-Id", "client-controlled-value");
        var first = client.exchange("/api/v1/health", HttpMethod.GET, new HttpEntity<>(headers), String.class);
        var second = client.getForEntity("/api/v1/auth/me", String.class);
        var validation = client.postForEntity("/api/v1/auth/login", Map.of("username", "", "password", ""), String.class);
        for (var response : List.of(first, second, validation)) {
            String requestId = response.getHeaders().getFirst("X-Request-Id");
            assertThat(requestId).isNotBlank().isNotEqualTo("client-controlled-value");
            assertThat(mapper.readTree(response.getBody()).path("requestId").asText()).isEqualTo(requestId);
        }
        assertThat(first.getHeaders().getFirst("X-Request-Id")).isNotEqualTo(second.getHeaders().getFirst("X-Request-Id"));
    }

    @Test
    void readinessIsPublicAndReportsDatabaseAvailability() {
        var response = client.getForEntity("/api/v1/ready", String.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).contains("\"status\":\"UP\"");
    }

    private Account account() throws Exception {
        String username = "q_" + UUID.randomUUID().toString().replace("-", "").substring(0, 20);
        var register = client.postForEntity("/api/v1/auth/register",
                Map.of("username", username, "password", "QualityPassword123", "nickname", "Quality"), String.class);
        assertThat(register.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        var login = client.postForEntity("/api/v1/auth/login",
                Map.of("username", username, "password", "QualityPassword123"), String.class);
        JsonNode data = mapper.readTree(login.getBody()).path("data");
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(data.path("accessToken").asText());
        return new Account(data.path("user").path("id").asLong(), headers);
    }

    @Test
    void appointmentPagesHaveStableOrderWhenAllVisitTimesMatch() throws Exception {
        var account = account();
        jdbc.update("insert into appointment_slots(visit_date,start_time,end_time,capacity,created_by,updated_by) "
                + "values('2099-01-01','09:00:00','10:00:00',100,?,?)", account.id(), account.id());
        long slotId = jdbc.queryForObject("select id from appointment_slots where visit_date='2099-01-01'", Long.class);
        var expected = new java.util.ArrayList<Long>();
        for (int index = 0; index < 21; index++) {
            String number = "QA" + UUID.randomUUID().toString().replace("-", "").substring(0, 24);
            jdbc.update("insert into appointments(appointment_no,user_id,slot_id,visitor_count,contact_name,contact_phone,contact_email,status) "
                    + "values(?,?,?,1,'Quality','123456789','quality@example.test','CANCELLED')", number, account.id(), slotId);
            expected.add(jdbc.queryForObject("select id from appointments where appointment_no=?", Long.class, number));
        }
        java.util.Collections.reverse(expected);
        var actual = new java.util.ArrayList<Long>();
        for (int page = 1; page <= 2; page++) {
            var response = client.exchange("/api/v1/appointments/me?page=" + page + "&size=20", HttpMethod.GET,
                    new HttpEntity<>(account.headers()), String.class);
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            JsonNode data = mapper.readTree(response.getBody()).path("data");
            assertThat(data.path("total").asInt()).isEqualTo(21);
            data.path("items").forEach(item -> actual.add(item.path("id").asLong()));
        }
        assertThat(actual).containsExactlyElementsOf(expected).doesNotHaveDuplicates();
    }

    private record Account(long id, HttpHeaders headers) {}
}

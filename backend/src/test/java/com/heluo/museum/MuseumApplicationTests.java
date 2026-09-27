package com.heluo.museum;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = "spring.profiles.active=test")
class MuseumApplicationTests {
    @LocalServerPort
    private int port;

    @Autowired
    private TestRestTemplate restTemplate;

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void healthEndpointReturnsStandardEnvelope() {
        var response = restTemplate.getForEntity("http://localhost:" + port + "/api/v1/health", String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).contains("\"code\":\"OK\"").contains("\"status\":\"UP\"");
    }

    @Test
    void invalidInputReturnsValidationErrorWithoutSensitiveDetails() {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        var response = restTemplate.postForEntity("http://localhost:" + port + "/api/v1/auth/register",
                new HttpEntity<>("{\"username\":\"!!\",\"password\":\"short\",\"nickname\":\"x\"}", headers),
                String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(response.getBody()).contains("VALIDATION_ERROR")
                .doesNotContain("passwordHash", "accessToken", "stackTrace", "org.springframework");
    }

    @Test
    void regularUserCannotAccessAdministratorApi() {
        String username = "member_" + System.nanoTime();
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        var registration = restTemplate.postForEntity("http://localhost:" + port + "/api/v1/auth/register",
                new HttpEntity<>("{\"username\":\"" + username + "\",\"password\":\"SafePassword123\",\"nickname\":\"测试用户\"}", headers),
                String.class);
        assertThat(registration.getStatusCode()).isEqualTo(HttpStatus.CREATED);

        var login = restTemplate.postForEntity("http://localhost:" + port + "/api/v1/auth/login",
                new HttpEntity<>("{\"username\":\"" + username + "\",\"password\":\"SafePassword123\"}", headers), String.class);
        assertThat(login.getStatusCode()).isEqualTo(HttpStatus.OK);
        String token = login.getBody().replaceAll(".*\\\"accessToken\\\":\\\"([^\\\"]+)\\\".*", "$1");
        assertThat(token).startsWith("eyJ");

        HttpHeaders protectedHeaders = new HttpHeaders();
        protectedHeaders.setBearerAuth(token);
        var response = restTemplate.exchange("http://localhost:" + port + "/api/v1/admin/users", org.springframework.http.HttpMethod.GET,
                new HttpEntity<>(protectedHeaders), String.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(response.getBody()).contains("FORBIDDEN");
    }

    @Test
    void mockPaymentIsIdempotentAndDeductsStockOnlyOnce() {
        String username = "buyer_" + System.nanoTime();
        HttpHeaders json = new HttpHeaders(); json.setContentType(MediaType.APPLICATION_JSON);
        restTemplate.postForEntity("http://localhost:" + port + "/api/v1/auth/register",
                new HttpEntity<>("{\"username\":\"" + username + "\",\"password\":\"SafePassword123\",\"nickname\":\"购买测试\"}", json), String.class);
        var login = restTemplate.postForEntity("http://localhost:" + port + "/api/v1/auth/login",
                new HttpEntity<>("{\"username\":\"" + username + "\",\"password\":\"SafePassword123\"}", json), String.class);
        String token = login.getBody().replaceAll(".*\\\"accessToken\\\":\\\"([^\\\"]+)\\\".*", "$1");
        long userId = jdbc.queryForObject("select id from users where username=?", Long.class, username);
        String suffix = String.valueOf(System.nanoTime());
        jdbc.update("insert into products(sku,name,slug,price,stock_quantity,status,created_by,updated_by,published_at) values(?,?,?,?,?,'PUBLISHED',?,?,current_timestamp)",
                "TEST-" + suffix, "测试商品", "test-product-" + suffix, new java.math.BigDecimal("12.50"), 5, userId, userId);
        long productId = jdbc.queryForObject("select id from products where sku=?", Long.class, "TEST-" + suffix);
        HttpHeaders bearer = new HttpHeaders(); bearer.setContentType(MediaType.APPLICATION_JSON); bearer.setBearerAuth(token);
        var add = restTemplate.postForEntity("http://localhost:" + port + "/api/v1/cart/items",
                new HttpEntity<>("{\"productId\":" + productId + ",\"quantity\":2}", bearer), String.class);
        assertThat(add.getStatusCode()).isEqualTo(HttpStatus.OK);
        long itemId = jdbc.queryForObject("select ci.id from cart_items ci join carts c on c.id=ci.cart_id where c.user_id=?", Long.class, userId);
        bearer.set("Idempotency-Key", "checkout-" + suffix);
        var order = restTemplate.postForEntity("http://localhost:" + port + "/api/v1/orders",
                new HttpEntity<>("{\"cartItemIds\":[" + itemId + "],\"notificationEmail\":\"buyer@example.test\"}", bearer), String.class);
        var orderRetry = restTemplate.postForEntity("http://localhost:" + port + "/api/v1/orders",
                new HttpEntity<>("{\"cartItemIds\":[" + itemId + "],\"notificationEmail\":\"buyer@example.test\"}", bearer), String.class);
        assertThat(order.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(orderRetry.getStatusCode()).isEqualTo(HttpStatus.OK);
        long orderId = jdbc.queryForObject("select id from orders where user_id=? order by created_at desc", Long.class, userId);
        assertThat(jdbc.queryForObject("select count(*) from orders where user_id=?", Integer.class, userId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select locked_stock from products where id=?", Integer.class, productId)).isEqualTo(2);
        bearer.set("Idempotency-Key", "payment-" + suffix);
        var first = restTemplate.postForEntity("http://localhost:" + port + "/api/v1/orders/" + orderId + "/mock-payment", new HttpEntity<>(bearer), String.class);
        var retry = restTemplate.postForEntity("http://localhost:" + port + "/api/v1/orders/" + orderId + "/mock-payment", new HttpEntity<>(bearer), String.class);
        assertThat(first.getStatusCode()).isEqualTo(HttpStatus.OK); assertThat(retry.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(jdbc.queryForObject("select stock_quantity from products where id=?", Integer.class, productId)).isEqualTo(3);
        assertThat(jdbc.queryForObject("select count(*) from payment_transactions where order_id=?", Integer.class, orderId)).isEqualTo(1);
    }

    @Test
    void cartQuantityCannotExceedCurrentAvailableStock() {
        String username = "cart_" + System.nanoTime();
        HttpHeaders json = new HttpHeaders(); json.setContentType(MediaType.APPLICATION_JSON);
        restTemplate.postForEntity("http://localhost:" + port + "/api/v1/auth/register",
                new HttpEntity<>("{\"username\":\"" + username + "\",\"password\":\"SafePassword123\",\"nickname\":\"购物车测试\"}", json), String.class);
        var login = restTemplate.postForEntity("http://localhost:" + port + "/api/v1/auth/login",
                new HttpEntity<>("{\"username\":\"" + username + "\",\"password\":\"SafePassword123\"}", json), String.class);
        String token = login.getBody().replaceAll(".*\\\"accessToken\\\":\\\"([^\\\"]+)\\\".*", "$1");
        long userId = jdbc.queryForObject("select id from users where username=?", Long.class, username);
        String suffix = String.valueOf(System.nanoTime());
        jdbc.update("insert into products(sku,name,slug,price,stock_quantity,status,created_by,updated_by,published_at) values(?,?,?,?,?,'PUBLISHED',?,?,current_timestamp)",
                "CART-" + suffix, "库存测试商品", "cart-product-" + suffix, new java.math.BigDecimal("9.90"), 1, userId, userId);
        long productId = jdbc.queryForObject("select id from products where sku=?", Long.class, "CART-" + suffix);
        HttpHeaders bearer = new HttpHeaders(); bearer.setContentType(MediaType.APPLICATION_JSON); bearer.setBearerAuth(token);
        var add = restTemplate.postForEntity("http://localhost:" + port + "/api/v1/cart/items",
                new HttpEntity<>("{\"productId\":" + productId + ",\"quantity\":1}", bearer), String.class);
        assertThat(add.getStatusCode()).isEqualTo(HttpStatus.OK);
        long itemId = jdbc.queryForObject("select ci.id from cart_items ci join carts c on c.id=ci.cart_id where c.user_id=?", Long.class, userId);
        var update = restTemplate.exchange("http://localhost:" + port + "/api/v1/cart/items/" + itemId,
                org.springframework.http.HttpMethod.PATCH, new HttpEntity<>("{\"quantity\":2}", bearer), String.class);
        assertThat(update.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(jdbc.queryForObject("select quantity from cart_items where id=?", Integer.class, itemId)).isEqualTo(1);
    }

    @Test
    void administratorCannotSetStockBelowLockedQuantity() {
        String suffix = String.valueOf(System.nanoTime());
        String username = "stock_admin_" + suffix;
        String password = "SafePassword123";
        jdbc.update("insert into users(username,password_hash,nickname,status) values(?,?,?,'ACTIVE')",
                username, new BCryptPasswordEncoder().encode(password), "库存管理员");
        long adminId = jdbc.queryForObject("select id from users where username=?", Long.class, username);
        jdbc.update("insert into user_roles(user_id,role_id,assigned_by) values(?,(select id from roles where code='ADMIN'),?)",
                adminId, adminId);

        HttpHeaders json = new HttpHeaders();
        json.setContentType(MediaType.APPLICATION_JSON);
        var login = restTemplate.postForEntity("http://localhost:" + port + "/api/v1/auth/login",
                new HttpEntity<>("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}", json), String.class);
        assertThat(login.getStatusCode()).isEqualTo(HttpStatus.OK);
        String token = login.getBody().replaceAll(".*\\\"accessToken\\\":\\\"([^\\\"]+)\\\".*", "$1");

        jdbc.update("insert into products(sku,name,slug,price,stock_quantity,locked_stock,status,created_by,updated_by,published_at) values(?,?,?,?,?,?,'PUBLISHED',?,?,current_timestamp)",
                "STOCK-" + suffix, "补货测试商品", "stock-product-" + suffix, new java.math.BigDecimal("19.90"), 10, 4, adminId, adminId);
        long productId = jdbc.queryForObject("select id from products where sku=?", Long.class, "STOCK-" + suffix);
        HttpHeaders bearer = new HttpHeaders();
        bearer.setContentType(MediaType.APPLICATION_JSON);
        bearer.setBearerAuth(token);

        var rejected = restTemplate.exchange("http://localhost:" + port + "/api/v1/admin/products/" + productId + "/stock",
                org.springframework.http.HttpMethod.PATCH, new HttpEntity<>("{\"stockQuantity\":3}", bearer), String.class);
        assertThat(rejected.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(jdbc.queryForObject("select stock_quantity from products where id=?", Integer.class, productId)).isEqualTo(10);

        var accepted = restTemplate.exchange("http://localhost:" + port + "/api/v1/admin/products/" + productId + "/stock",
                org.springframework.http.HttpMethod.PATCH, new HttpEntity<>("{\"stockQuantity\":6}", bearer), String.class);
        assertThat(accepted.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(jdbc.queryForObject("select stock_quantity from products where id=?", Integer.class, productId)).isEqualTo(6);
    }

    @Test
    void cancellingFutureAppointmentReleasesReservedCapacity() {
        String username = "visitor_" + System.nanoTime();
        HttpHeaders json = new HttpHeaders(); json.setContentType(MediaType.APPLICATION_JSON);
        restTemplate.postForEntity("http://localhost:" + port + "/api/v1/auth/register",
                new HttpEntity<>("{\"username\":\"" + username + "\",\"password\":\"SafePassword123\",\"nickname\":\"预约测试\"}", json), String.class);
        var login = restTemplate.postForEntity("http://localhost:" + port + "/api/v1/auth/login",
                new HttpEntity<>("{\"username\":\"" + username + "\",\"password\":\"SafePassword123\"}", json), String.class);
        String token = login.getBody().replaceAll(".*\\\"accessToken\\\":\\\"([^\\\"]+)\\\".*", "$1");
        long userId = jdbc.queryForObject("select id from users where username=?", Long.class, username);
        java.time.LocalDate date = java.time.LocalDate.now().plusDays(2);
        jdbc.update("insert into appointment_slots(visit_date,start_time,end_time,capacity,status,created_by,updated_by) values(?,?,?,?, 'OPEN',?,?)",
                date, java.sql.Time.valueOf("10:00:00"), java.sql.Time.valueOf("12:00:00"), 5, userId, userId);
        long slotId = jdbc.queryForObject("select id from appointment_slots where visit_date=? and start_time=?", Long.class, date, java.sql.Time.valueOf("10:00:00"));
        HttpHeaders bearer = new HttpHeaders(); bearer.setContentType(MediaType.APPLICATION_JSON); bearer.setBearerAuth(token);
        var created = restTemplate.postForEntity("http://localhost:" + port + "/api/v1/appointments",
                new HttpEntity<>("{\"slotId\":" + slotId + ",\"visitorCount\":2,\"contactName\":\"预约测试\",\"contactPhone\":\"13800138000\",\"contactEmail\":\"visitor@example.test\"}", bearer), String.class);
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.OK);
        long appointmentId = jdbc.queryForObject("select id from appointments where user_id=?", Long.class, userId);
        var cancelled = restTemplate.postForEntity("http://localhost:" + port + "/api/v1/appointments/" + appointmentId + "/cancel",
                new HttpEntity<>("{\"reason\":\"测试取消\"}", bearer), String.class);
        assertThat(cancelled.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(jdbc.queryForObject("select status from appointments where id=?", String.class, appointmentId)).isEqualTo("CANCELLED");
        assertThat(jdbc.queryForObject("select reserved_people from appointment_slots where id=?", Integer.class, slotId)).isZero();
    }

    @Test
    void pastAppointmentDateIsRejectedWithoutReservingCapacity() {
        String username = "past_visitor_" + System.nanoTime();
        HttpHeaders json = new HttpHeaders(); json.setContentType(MediaType.APPLICATION_JSON);
        restTemplate.postForEntity("http://localhost:" + port + "/api/v1/auth/register",
                new HttpEntity<>("{\"username\":\"" + username + "\",\"password\":\"SafePassword123\",\"nickname\":\"过去日期测试\"}", json), String.class);
        var login = restTemplate.postForEntity("http://localhost:" + port + "/api/v1/auth/login",
                new HttpEntity<>("{\"username\":\"" + username + "\",\"password\":\"SafePassword123\"}", json), String.class);
        String token = login.getBody().replaceAll(".*\\\"accessToken\\\":\\\"([^\\\"]+)\\\".*", "$1");
        long userId = jdbc.queryForObject("select id from users where username=?", Long.class, username);
        java.time.LocalDate date = java.time.LocalDate.now().minusDays(1);
        jdbc.update("insert into appointment_slots(visit_date,start_time,end_time,capacity,status,created_by,updated_by) values(?,?,?,?, 'OPEN',?,?)",
                date, java.sql.Time.valueOf("10:00:00"), java.sql.Time.valueOf("12:00:00"), 5, userId, userId);
        long slotId = jdbc.queryForObject("select id from appointment_slots where visit_date=? and start_time=?", Long.class, date, java.sql.Time.valueOf("10:00:00"));
        HttpHeaders bearer = new HttpHeaders(); bearer.setContentType(MediaType.APPLICATION_JSON); bearer.setBearerAuth(token);
        var response = restTemplate.postForEntity("http://localhost:" + port + "/api/v1/appointments",
                new HttpEntity<>("{\"slotId\":" + slotId + ",\"visitorCount\":2,\"contactName\":\"过去日期测试\",\"contactPhone\":\"13800138000\",\"contactEmail\":\"past@example.test\"}", bearer), String.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody()).contains("参观日期不能早于今天");
        assertThat(jdbc.queryForObject("select reserved_people from appointment_slots where id=?", Integer.class, slotId)).isZero();
    }

    @Test
    void appointmentCreationIsIdempotentAndBlocksDuplicateActiveReservations() {
        String suffix = String.valueOf(System.nanoTime());
        String username = "appointment_key_" + suffix;
        HttpHeaders json = new HttpHeaders(); json.setContentType(MediaType.APPLICATION_JSON);
        restTemplate.postForEntity("http://localhost:" + port + "/api/v1/auth/register",
                new HttpEntity<>("{\"username\":\"" + username + "\",\"password\":\"SafePassword123\",\"nickname\":\"幂等预约\"}", json), String.class);
        var login = restTemplate.postForEntity("http://localhost:" + port + "/api/v1/auth/login",
                new HttpEntity<>("{\"username\":\"" + username + "\",\"password\":\"SafePassword123\"}", json), String.class);
        String token = login.getBody().replaceAll(".*\\\"accessToken\\\":\\\"([^\\\"]+)\\\".*", "$1");
        long userId = jdbc.queryForObject("select id from users where username=?", Long.class, username);
        java.time.LocalDate date = java.time.LocalDate.now().plusDays(4);
        jdbc.update("insert into appointment_slots(visit_date,start_time,end_time,capacity,status,created_by,updated_by) values(?,?,?,?, 'OPEN',?,?)",
                date, java.sql.Time.valueOf("08:00:00"), java.sql.Time.valueOf("09:30:00"), 5, userId, userId);
        long slotId = jdbc.queryForObject("select id from appointment_slots where visit_date=? and start_time=?", Long.class,
                date, java.sql.Time.valueOf("08:00:00"));
        HttpHeaders bearer = new HttpHeaders(); bearer.setContentType(MediaType.APPLICATION_JSON); bearer.setBearerAuth(token);
        bearer.set("Idempotency-Key", "appointment-key-" + suffix);
        String payload = "{\"slotId\":" + slotId + ",\"visitorCount\":1,\"contactName\":\"幂等预约\",\"contactPhone\":\"13800138000\",\"contactEmail\":\"key@example.test\"}";
        var first = restTemplate.postForEntity("http://localhost:" + port + "/api/v1/appointments", new HttpEntity<>(payload, bearer), String.class);
        var retry = restTemplate.postForEntity("http://localhost:" + port + "/api/v1/appointments", new HttpEntity<>(payload, bearer), String.class);
        assertThat(first.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(retry.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(retry.getHeaders().getFirst("X-Request-Id")).isNotBlank()
                .isNotEqualTo(first.getHeaders().getFirst("X-Request-Id"));
        assertThat(retry.getBody()).contains("\"status\":\"PENDING\"");
        assertThat(jdbc.queryForObject("select count(*) from appointments where user_id=? and slot_id=?", Integer.class, userId, slotId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select reserved_people from appointment_slots where id=?", Integer.class, slotId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from appointment_active_keys where user_id=? and slot_id=?", Integer.class, userId, slotId)).isEqualTo(1);

        bearer.set("Idempotency-Key", "appointment-other-" + suffix);
        var duplicate = restTemplate.postForEntity("http://localhost:" + port + "/api/v1/appointments", new HttpEntity<>(payload, bearer), String.class);
        assertThat(duplicate.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(duplicate.getBody()).contains("DUPLICATE_ACTIVE_APPOINTMENT");

        long appointmentId = jdbc.queryForObject("select id from appointments where user_id=? and slot_id=?", Long.class, userId, slotId);
        var cancelled = restTemplate.postForEntity("http://localhost:" + port + "/api/v1/appointments/" + appointmentId + "/cancel",
                new HttpEntity<>("{\"reason\":\"重新预约测试\"}", bearer), String.class);
        assertThat(cancelled.getStatusCode()).isEqualTo(HttpStatus.OK);
        bearer.set("Idempotency-Key", "appointment-after-cancel-" + suffix);
        var rebooked = restTemplate.postForEntity("http://localhost:" + port + "/api/v1/appointments", new HttpEntity<>(payload, bearer), String.class);
        assertThat(rebooked.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(jdbc.queryForObject("select count(*) from appointments where user_id=? and slot_id=? and status in ('PENDING','CONFIRMED')",
                Integer.class, userId, slotId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select reserved_people from appointment_slots where id=?", Integer.class, slotId)).isEqualTo(1);
    }

    @Test
    void concurrentAppointmentRequestsAllowOnlyOneActiveReservation() throws Exception {
        String suffix = String.valueOf(System.nanoTime());
        String token = registerAndLogin("parallel_" + suffix);
        long userId = jdbc.queryForObject("select id from users where username=?", Long.class, "parallel_" + suffix);
        java.time.LocalDate date = java.time.LocalDate.now().plusDays(6);
        jdbc.update("insert into appointment_slots(visit_date,start_time,end_time,capacity,status,created_by,updated_by) values(?,?,?,?, 'OPEN',?,?)",
                date, java.sql.Time.valueOf("16:00:00"), java.sql.Time.valueOf("17:30:00"), 1, userId, userId);
        long slotId = jdbc.queryForObject("select id from appointment_slots where visit_date=? and start_time=?", Long.class,
                date, java.sql.Time.valueOf("16:00:00"));
        String payload = "{\"slotId\":" + slotId + ",\"visitorCount\":1,\"contactName\":\"并发预约\","
                + "\"contactPhone\":\"13800138000\",\"contactEmail\":\"parallel@example.test\"}";
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        Callable<org.springframework.http.ResponseEntity<String>> request = () -> {
            ready.countDown();
            assertThat(start.await(5, TimeUnit.SECONDS)).isTrue();
            HttpHeaders bearer = new HttpHeaders();
            bearer.setContentType(MediaType.APPLICATION_JSON);
            bearer.setBearerAuth(token);
            bearer.set("Idempotency-Key", "parallel-" + suffix + "-" + Thread.currentThread().getId());
            return restTemplate.postForEntity("http://localhost:" + port + "/api/v1/appointments",
                    new HttpEntity<>(payload, bearer), String.class);
        };
        try {
            var first = executor.submit(request);
            var second = executor.submit(request);
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            var firstResponse = first.get(10, TimeUnit.SECONDS);
            var secondResponse = second.get(10, TimeUnit.SECONDS);
            long successCount = java.util.stream.Stream.of(firstResponse, secondResponse)
                    .filter(response -> response.getStatusCode() == HttpStatus.OK).count();
            long conflictCount = java.util.stream.Stream.of(firstResponse, secondResponse)
                    .filter(response -> response.getStatusCode() == HttpStatus.CONFLICT).count();
            assertThat(successCount).isEqualTo(1);
            assertThat(conflictCount).isEqualTo(1);
        } finally {
            executor.shutdownNow();
        }
        assertThat(jdbc.queryForObject("select count(*) from appointments where user_id=? and slot_id=? and status in ('PENDING','CONFIRMED')",
                Integer.class, userId, slotId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select reserved_people from appointment_slots where id=?", Integer.class, slotId)).isEqualTo(1);
    }

    @Test
    void publicAppointmentWindowRejectsTheFifteenthDayInBothReadAndWritePaths() {
        String suffix = String.valueOf(System.nanoTime());
        String token = registerAndLogin("window_" + suffix);
        long userId = jdbc.queryForObject("select id from users where username=?", Long.class, "window_" + suffix);
        java.time.LocalDate farDate = java.time.LocalDate.now().plusDays(14);
        jdbc.update("insert into appointment_slots(visit_date,start_time,end_time,capacity,status,created_by,updated_by) values(?,?,?,?, 'OPEN',?,?)",
                farDate, java.sql.Time.valueOf("13:00:00"), java.sql.Time.valueOf("14:30:00"), 5, userId, userId);
        long slotId = jdbc.queryForObject("select id from appointment_slots where visit_date=? and start_time=?", Long.class,
                farDate, java.sql.Time.valueOf("13:00:00"));

        var listing = restTemplate.getForEntity("http://localhost:" + port + "/api/v1/appointment-slots?dateFrom=" + farDate + "&dateTo=" + farDate,
                String.class);
        assertThat(listing.getStatusCode()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(listing.getBody()).contains("未来 14 天");

        var create = restTemplate.postForEntity("http://localhost:" + port + "/api/v1/appointments",
                new HttpEntity<>("{\"slotId\":" + slotId + ",\"visitorCount\":1,\"contactName\":\"窗口测试\",\"contactPhone\":\"13800138000\",\"contactEmail\":\"window@example.test\"}",
                        authHeaders(token)), String.class);
        assertThat(create.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(create.getBody()).contains("APPOINTMENT_OUTSIDE_OPEN_WINDOW");
        assertThat(jdbc.queryForObject("select reserved_people from appointment_slots where id=?", Integer.class, slotId)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from appointments where slot_id=?", Integer.class, slotId)).isZero();
    }

    @Test
    void concurrentAdminCancellationsReleaseCapacityOnlyOnce() throws Exception {
        String suffix = String.valueOf(System.nanoTime());
        String userToken = registerAndLogin("ac_owner_" + suffix);
        long userId = jdbc.queryForObject("select id from users where username=?", Long.class, "ac_owner_" + suffix);
        java.time.LocalDate date = java.time.LocalDate.now().plusDays(5);
        jdbc.update("insert into appointment_slots(visit_date,start_time,end_time,capacity,status,created_by,updated_by) values(?,?,?,?, 'OPEN',?,?)",
                date, java.sql.Time.valueOf("15:00:00"), java.sql.Time.valueOf("16:30:00"), 2, userId, userId);
        long slotId = jdbc.queryForObject("select id from appointment_slots where visit_date=? and start_time=?", Long.class,
                date, java.sql.Time.valueOf("15:00:00"));
        var created = restTemplate.postForEntity("http://localhost:" + port + "/api/v1/appointments",
                new HttpEntity<>("{\"slotId\":" + slotId + ",\"visitorCount\":2,\"contactName\":\"并发取消\",\"contactPhone\":\"13800138000\",\"contactEmail\":\"admin-cancel@example.test\"}",
                        authHeaders(userToken)), String.class);
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.OK);
        long appointmentId = jdbc.queryForObject("select id from appointments where user_id=? and slot_id=?", Long.class, userId, slotId);
        String adminToken = createAdminToken("admin_cancel_" + suffix);

        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        Callable<org.springframework.http.ResponseEntity<String>> cancel = () -> {
            ready.countDown();
            assertThat(start.await(5, TimeUnit.SECONDS)).isTrue();
            return restTemplate.postForEntity("http://localhost:" + port + "/api/v1/admin/appointments/" + appointmentId + "/cancel",
                    new HttpEntity<>("{\"reason\":\"并发运营取消\"}", authHeaders(adminToken)), String.class);
        };
        org.springframework.http.ResponseEntity<String> first;
        org.springframework.http.ResponseEntity<String> second;
        try {
            var firstFuture = executor.submit(cancel);
            var secondFuture = executor.submit(cancel);
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            first = firstFuture.get(10, TimeUnit.SECONDS);
            second = secondFuture.get(10, TimeUnit.SECONDS);
        } finally {
            executor.shutdownNow();
        }
        long successful = java.util.stream.Stream.of(first, second).filter(response -> response.getStatusCode() == HttpStatus.OK).count();
        assertThat(successful).isEqualTo(1);
        assertThat(jdbc.queryForObject("select status from appointments where id=?", String.class, appointmentId)).isEqualTo("CANCELLED");
        assertThat(jdbc.queryForObject("select reserved_people from appointment_slots where id=?", Integer.class, slotId)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from appointment_active_keys where appointment_id=?", Integer.class, appointmentId)).isZero();
    }

    @Test
    void adminConfirmAndUserCancelNeverLeaveAnActiveBookingWithoutCapacityOrKey() throws Exception {
        String suffix = String.valueOf(System.nanoTime());
        String userToken = registerAndLogin("cc_owner_" + suffix);
        long userId = jdbc.queryForObject("select id from users where username=?", Long.class, "cc_owner_" + suffix);
        java.time.LocalDate date = java.time.LocalDate.now().plusDays(6);
        jdbc.update("insert into appointment_slots(visit_date,start_time,end_time,capacity,status,created_by,updated_by) values(?,?,?,?, 'OPEN',?,?)",
                date, java.sql.Time.valueOf("11:00:00"), java.sql.Time.valueOf("12:30:00"), 1, userId, userId);
        long slotId = jdbc.queryForObject("select id from appointment_slots where visit_date=? and start_time=?", Long.class,
                date, java.sql.Time.valueOf("11:00:00"));
        var created = restTemplate.postForEntity("http://localhost:" + port + "/api/v1/appointments",
                new HttpEntity<>("{\"slotId\":" + slotId + ",\"visitorCount\":1,\"contactName\":\"状态竞态\",\"contactPhone\":\"13800138000\",\"contactEmail\":\"confirm-cancel@example.test\"}",
                        authHeaders(userToken)), String.class);
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.OK);
        long appointmentId = jdbc.queryForObject("select id from appointments where user_id=? and slot_id=?", Long.class, userId, slotId);
        String adminToken = createAdminToken("cc_admin_" + suffix);

        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        Callable<org.springframework.http.ResponseEntity<String>> confirm = () -> {
            ready.countDown();
            assertThat(start.await(5, TimeUnit.SECONDS)).isTrue();
            return restTemplate.postForEntity("http://localhost:" + port + "/api/v1/admin/appointments/" + appointmentId + "/confirm",
                    new HttpEntity<>(authHeaders(adminToken)), String.class);
        };
        Callable<org.springframework.http.ResponseEntity<String>> cancel = () -> {
            ready.countDown();
            assertThat(start.await(5, TimeUnit.SECONDS)).isTrue();
            return restTemplate.postForEntity("http://localhost:" + port + "/api/v1/appointments/" + appointmentId + "/cancel",
                    new HttpEntity<>("{\"reason\":\"用户并发取消\"}", authHeaders(userToken)), String.class);
        };
        try {
            var confirmFuture = executor.submit(confirm);
            var cancelFuture = executor.submit(cancel);
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            var confirmResponse = confirmFuture.get(10, TimeUnit.SECONDS);
            var cancelResponse = cancelFuture.get(10, TimeUnit.SECONDS);
            assertThat(confirmResponse.getStatusCode()).isIn(HttpStatus.OK, HttpStatus.CONFLICT);
            assertThat(cancelResponse.getStatusCode()).isIn(HttpStatus.OK, HttpStatus.CONFLICT);
        } finally {
            executor.shutdownNow();
        }
        assertThat(jdbc.queryForObject("select status from appointments where id=?", String.class, appointmentId)).isEqualTo("CANCELLED");
        assertThat(jdbc.queryForObject("select reserved_people from appointment_slots where id=?", Integer.class, slotId)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from appointment_active_keys where appointment_id=?", Integer.class, appointmentId)).isZero();
    }

    @Test
    void adminPatchPreservesOmittedArtifactFields() {
        String suffix = String.valueOf(System.nanoTime());
        String adminToken = createAdminToken("patch_admin_" + suffix);
        long adminId = jdbc.queryForObject("select id from users where username=?", Long.class, "patch_admin_" + suffix);
        jdbc.update("insert into categories(code,name,description,sort_order,enabled) values(?,?,?,0,true)",
                "PATCH_" + suffix, "PATCH 测试分类 " + suffix, "patch test");
        long categoryId = jdbc.queryForObject("select id from categories where code=?", Long.class, "PATCH_" + suffix);
        String slug = "patch-preserve-" + suffix;
        HttpHeaders json = new HttpHeaders();
        json.setContentType(MediaType.APPLICATION_JSON);
        String createPayload = "{\"categoryId\":" + categoryId + ",\"accessionNo\":\"ACC-" + suffix
                + "\",\"title\":\"原始标题\",\"slug\":\"" + slug
                + "\",\"period\":\"战国\",\"material\":\"青铜\",\"dimensions\":\"20×10cm\","
                + "\"collectionLocation\":\"洛阳\",\"coverImageUrl\":\"/cover.webp\","
                + "\"coverAssetRef\":\"ASSET-" + suffix + "\",\"summary\":\"原始摘要\",\"content\":\"原始正文\"}";
        var created = restTemplate.postForEntity("http://localhost:" + port + "/api/v1/admin/artifacts",
                new HttpEntity<>(createPayload, authHeaders(adminToken)), String.class);
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.OK);
        long artifactId = jdbc.queryForObject("select id from artifacts where slug=?", Long.class, slug);

        var updated = restTemplate.exchange("http://localhost:" + port + "/api/v1/admin/artifacts/" + artifactId,
                org.springframework.http.HttpMethod.PATCH,
                new HttpEntity<>("{\"title\":\"只改标题\"}", authHeaders(adminToken)), String.class);
        assertThat(updated.getStatusCode()).isEqualTo(HttpStatus.OK);
        var row = jdbc.queryForMap("select title,accession_no,period,material,dimensions,collection_location,cover_image_url,"
                + "cover_asset_ref,summary,content from artifacts where id=?", artifactId);
        assertThat(row.get("TITLE")).isEqualTo("只改标题");
        assertThat(row.get("ACCESSION_NO")).isEqualTo("ACC-" + suffix);
        assertThat(row.get("PERIOD")).isEqualTo("战国");
        assertThat(row.get("MATERIAL")).isEqualTo("青铜");
        assertThat(row.get("DIMENSIONS")).isEqualTo("20×10cm");
        assertThat(row.get("COLLECTION_LOCATION")).isEqualTo("洛阳");
        assertThat(row.get("COVER_IMAGE_URL")).isEqualTo("/cover.webp");
        assertThat(row.get("COVER_ASSET_REF")).isEqualTo("ASSET-" + suffix);
        assertThat(row.get("SUMMARY")).isEqualTo("原始摘要");
        assertThat(row.get("CONTENT")).isEqualTo("原始正文");
    }

    @Test
    void ordersAreUserScopedAndPaged() {
        String suffix = String.valueOf(System.nanoTime());
        String firstToken = registerAndLogin("order_owner_" + suffix);
        String otherToken = registerAndLogin("order_other_" + suffix);
        long ownerId = jdbc.queryForObject("select id from users where username=?", Long.class, "order_owner_" + suffix);
        String sku = "ORDER-" + suffix;
        jdbc.update("insert into products(sku,name,slug,price,stock_quantity,status,created_by,updated_by,published_at) values(?,?,?,?,?,'PUBLISHED',?,?,current_timestamp)",
                sku, "订单权限测试商品", "order-permission-" + suffix, new java.math.BigDecimal("18.80"), 2, ownerId, ownerId);
        long productId = jdbc.queryForObject("select id from products where sku=?", Long.class, sku);

        HttpHeaders ownerHeaders = authHeaders(firstToken);
        ownerHeaders.setContentType(MediaType.APPLICATION_JSON);
        var added = restTemplate.postForEntity("http://localhost:" + port + "/api/v1/cart/items",
                new HttpEntity<>("{\"productId\":" + productId + ",\"quantity\":1}", ownerHeaders), String.class);
        assertThat(added.getStatusCode()).isEqualTo(HttpStatus.OK);
        long itemId = jdbc.queryForObject("select ci.id from cart_items ci join carts c on c.id=ci.cart_id where c.user_id=? and ci.product_id=?",
                Long.class, ownerId, productId);
        ownerHeaders.set("Idempotency-Key", "order-scope-" + suffix);
        var order = restTemplate.postForEntity("http://localhost:" + port + "/api/v1/orders",
                new HttpEntity<>("{\"cartItemIds\":[" + itemId + "],\"notificationEmail\":\"owner@example.test\"}", ownerHeaders), String.class);
        assertThat(order.getStatusCode()).isEqualTo(HttpStatus.OK);
        long orderId = jdbc.queryForObject("select id from orders where user_id=? and checkout_idempotency_key=?", Long.class,
                ownerId, "order-scope-" + suffix);

        var ownerDetail = restTemplate.getForEntity("http://localhost:" + port + "/api/v1/orders/" + orderId,
                String.class);
        // The unauthenticated detail request must be rejected; the owner check is asserted below with its bearer token.
        assertThat(ownerDetail.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        var otherDetail = restTemplate.exchange("http://localhost:" + port + "/api/v1/orders/" + orderId,
                org.springframework.http.HttpMethod.GET, new HttpEntity<>(authHeaders(otherToken)), String.class);
        assertThat(otherDetail.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        var ownerDetailWithToken = restTemplate.exchange("http://localhost:" + port + "/api/v1/orders/" + orderId,
                org.springframework.http.HttpMethod.GET, new HttpEntity<>(authHeaders(firstToken)), String.class);
        assertThat(ownerDetailWithToken.getStatusCode()).isEqualTo(HttpStatus.OK);

        var otherList = restTemplate.exchange("http://localhost:" + port + "/api/v1/orders?page=1&size=20",
                org.springframework.http.HttpMethod.GET, new HttpEntity<>(authHeaders(otherToken)), String.class);
        assertThat(otherList.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(otherList.getBody()).contains("\"total\":0");
    }

    private String registerAndLogin(String username) {
        HttpHeaders json = new HttpHeaders();
        json.setContentType(MediaType.APPLICATION_JSON);
        var registration = restTemplate.postForEntity("http://localhost:" + port + "/api/v1/auth/register",
                new HttpEntity<>("{\"username\":\"" + username + "\",\"password\":\"SafePassword123\",\"nickname\":\"测试用户\"}", json),
                String.class);
        assertThat(registration.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        var login = restTemplate.postForEntity("http://localhost:" + port + "/api/v1/auth/login",
                new HttpEntity<>("{\"username\":\"" + username + "\",\"password\":\"SafePassword123\"}", json), String.class);
        assertThat(login.getStatusCode()).isEqualTo(HttpStatus.OK);
        return accessToken(login.getBody());
    }

    private String createAdminToken(String username) {
        String password = "SafePassword123";
        jdbc.update("insert into users(username,password_hash,nickname,status) values(?,?,?,'ACTIVE')",
                username, new BCryptPasswordEncoder().encode(password), "测试管理员");
        long adminId = jdbc.queryForObject("select id from users where username=?", Long.class, username);
        jdbc.update("insert into user_roles(user_id,role_id,assigned_by) values(?,(select id from roles where code='ADMIN'),?)",
                adminId, adminId);
        HttpHeaders json = new HttpHeaders();
        json.setContentType(MediaType.APPLICATION_JSON);
        var login = restTemplate.postForEntity("http://localhost:" + port + "/api/v1/auth/login",
                new HttpEntity<>("{\"username\":\"" + username + "\",\"password\":\"" + password + "\"}", json), String.class);
        assertThat(login.getStatusCode()).isEqualTo(HttpStatus.OK);
        return accessToken(login.getBody());
    }

    private static String accessToken(String body) {
        assertThat(body).isNotNull();
        return body.replaceAll(".*\\\"accessToken\\\":\\\"([^\\\"]+)\\\".*", "$1");
    }

    private static HttpHeaders authHeaders(String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        headers.setContentType(MediaType.APPLICATION_JSON);
        return headers;
    }
}

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
}

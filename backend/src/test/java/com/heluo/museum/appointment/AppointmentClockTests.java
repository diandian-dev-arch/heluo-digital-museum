package com.heluo.museum.appointment;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.heluo.museum.auth.JwtService;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=test",
        "spring.datasource.url=jdbc:h2:mem:museum-clock;MODE=MySQL;DB_CLOSE_DELAY=-1;DB_CLOSE_ON_EXIT=FALSE"
})
@Import(AppointmentClockTests.FixedTime.class)
class AppointmentClockTests {
    private static final LocalDate TODAY = LocalDate.of(2030, 1, 2);
    @Autowired private TestRestTemplate client;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private JwtService jwt;
    @Autowired private ObjectMapper mapper;

    @Test
    void shanghaiMidnightControlsAvailabilityAndFourteenDayBookingWindow() throws Exception {
        var account = account(false);
        long started = slot(account.id(), TODAY, LocalTime.MIDNIGHT);
        long next = slot(account.id(), TODAY, LocalTime.of(0, 1));
        var slots = client.getForEntity("/api/v1/appointment-slots", String.class);
        assertThat(slots.getStatusCode()).isEqualTo(HttpStatus.OK);
        var ids = mapper.readTree(slots.getBody()).path("data").findValuesAsText("id");
        assertThat(ids).contains(String.valueOf(next)).doesNotContain(String.valueOf(started));
        assertThat(client.getForEntity("/api/v1/appointment-slots?dateFrom=2030-01-01", String.class).getStatusCode())
                .isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);

        long lastDay = slot(account.id(), TODAY.plusDays(13), LocalTime.of(9, 0));
        long outside = slot(account.id(), TODAY.plusDays(14), LocalTime.of(9, 0));
        assertThat(book(account, lastDay).getStatusCode()).isEqualTo(HttpStatus.OK);
        var denied = book(account, outside);
        assertThat(denied.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(denied.getBody()).contains("APPOINTMENT_OUTSIDE_OPEN_WINDOW");
        assertThat(book(account, started).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void cancellationStopsExactlyTwoHoursBeforeShanghaiStartTime() throws Exception {
        var account = account(false);
        long exact = slot(account.id(), TODAY, LocalTime.of(2, 0));
        long before = slot(account.id(), TODAY, LocalTime.of(2, 0, 1));
        long exactAppointment = mapper.readTree(book(account, exact).getBody()).path("data").path("id").asLong();
        long beforeAppointment = mapper.readTree(book(account, before).getBody()).path("data").path("id").asLong();
        var denied = client.postForEntity("/api/v1/appointments/" + exactAppointment + "/cancel",
                new HttpEntity<>(Map.of("reason", "Changed plans"), account.headers()), String.class);
        var cancelled = client.postForEntity("/api/v1/appointments/" + beforeAppointment + "/cancel",
                new HttpEntity<>(Map.of("reason", "Changed plans"), account.headers()), String.class);
        assertThat(denied.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(cancelled.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(jdbc.queryForObject("select reserved_people from appointment_slots where id=?", Integer.class, exact)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select reserved_people from appointment_slots where id=?", Integer.class, before)).isZero();
    }

    @Test
    void administratorValidationUsesTheSameShanghaiDateAsBooking() {
        var admin = account(true);
        var future = Map.of("visitDate", "2030-01-02", "startTime", "04:00:00", "endTime", "05:00:00", "capacity", 10, "status", "OPEN");
        var past = Map.of("visitDate", "2030-01-01", "startTime", "23:30:00", "endTime", "23:59:00", "capacity", 10, "status", "OPEN");
        assertThat(client.postForEntity("/api/v1/admin/appointment-slots", new HttpEntity<>(future, admin.headers()), String.class)
                .getStatusCode()).isEqualTo(HttpStatus.OK);
        var rejected = client.postForEntity("/api/v1/admin/appointment-slots", new HttpEntity<>(past, admin.headers()), String.class);
        assertThat(rejected.getStatusCode()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat(rejected.getBody()).contains("visitDate");
    }

    private org.springframework.http.ResponseEntity<String> book(Account account, long slot) {
        return client.postForEntity("/api/v1/appointments", new HttpEntity<>(Map.of("slotId", slot, "visitorCount", 1,
                "contactName", "Quality", "contactPhone", "13800000000", "contactEmail", "quality@example.test"), account.headers()), String.class);
    }

    private long slot(long actor, LocalDate date, LocalTime start) {
        jdbc.update("insert into appointment_slots(visit_date,start_time,end_time,capacity,created_by,updated_by) values(?,?,?,10,?,?)",
                date, start, start.plusMinutes(30), actor, actor);
        return jdbc.queryForObject("select id from appointment_slots where visit_date=? and start_time=?", Long.class, date, start);
    }

    private Account account(boolean admin) {
        String name = "clock_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        jdbc.update("insert into users(username,password_hash,nickname) values(?,'unused-test-hash','Clock')", name);
        long id = jdbc.queryForObject("select id from users where username=?", Long.class, name);
        jdbc.update("insert into user_roles(user_id,role_id) select ?,id from roles where code=?", id, admin ? "ADMIN" : "USER");
        var token = jwt.issue(id);
        jdbc.update("insert into auth_sessions(id,user_id,expires_at) values(?,?,?)", token.id(), id, Timestamp.from(token.expiresAt()));
        var headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(token.value());
        return new Account(id, headers);
    }

    private record Account(long id, HttpHeaders headers) {}

    @TestConfiguration
    static class FixedTime {
        @Bean @Primary Clock fixedClock() {
            return Clock.fixed(Instant.parse("2030-01-01T16:00:00Z"), ZoneId.of("Asia/Shanghai"));
        }
    }
}

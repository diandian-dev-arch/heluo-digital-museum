package com.heluo.museum.appointment;

import com.heluo.museum.common.api.ApiResponse;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/appointment-slots")
public class AppointmentSlotController {
    private final JdbcTemplate jdbc;
    private final Clock clock;

    AppointmentSlotController(JdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @GetMapping
    public ApiResponse<List<Slot>> list(@RequestParam(required = false) LocalDate dateFrom,
                                        @RequestParam(required = false) LocalDate dateTo) {
        LocalDateTime current = LocalDateTime.now(clock);
        LocalDate today = current.toLocalDate();
        LocalDate openWindowEnd = AppointmentController.openWindowEnd(today);
        LocalDate from = dateFrom == null ? today : dateFrom;
        LocalDate to = dateTo == null ? openWindowEnd : dateTo;
        if (from.isBefore(today) || to.isAfter(openWindowEnd) || to.isBefore(from)) {
            throw new IllegalArgumentException("公开预约仅开放今天起未来 14 天的日期范围");
        }
        LocalTime now = current.toLocalTime();
        return ApiResponse.ok(jdbc.query(
                "select id,visit_date,start_time,end_time,capacity,reserved_people from appointment_slots "
                        + "where visit_date between ? and ? and status='OPEN' and reserved_people<capacity "
                        + "and (visit_date>? or (visit_date=? and start_time>?)) "
                        + "order by visit_date,start_time",
                (r, n) -> new Slot(r.getLong(1), r.getDate(2).toLocalDate(), r.getTime(3).toLocalTime(),
                        r.getTime(4).toLocalTime(), r.getInt(5) - r.getInt(6)), from, to, today, today, now), "slots");
    }

    public record Slot(long id, LocalDate visitDate, java.time.LocalTime startTime,
                       java.time.LocalTime endTime, int remainingPeople) {
    }
}

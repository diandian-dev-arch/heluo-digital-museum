package com.heluo.museum.appointment;

import com.heluo.museum.common.api.ApiResponse;
import com.heluo.museum.common.audit.OperationLogService;
import com.heluo.museum.common.error.ContentPage;
import com.heluo.museum.common.error.ConflictException;
import com.heluo.museum.common.error.ResourceNotFoundException;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/appointments")
public class AppointmentController {
    private final JdbcTemplate jdbc;
    private final OperationLogService operationLogService;

    AppointmentController(JdbcTemplate jdbc, OperationLogService operationLogService) {
        this.jdbc = jdbc;
        this.operationLogService = operationLogService;
    }

    @PostMapping
    @Transactional
    public ApiResponse<AppointmentView> create(Authentication authentication, @Valid @RequestBody Create body) {
        long userId = actorId(authentication);
        Slot slot = slotById(body.slotId());
        if (slot.visitDate().isBefore(LocalDate.now())) {
            throw new ConflictException("参观日期不能早于今天");
        }
        if (!"OPEN".equals(slot.status()) || !slot.startAt().isAfter(LocalDateTime.now())) {
            throw new ConflictException("预约时段不可用");
        }
        int changed = jdbc.update("update appointment_slots set reserved_people=reserved_people+? where id=? and status='OPEN' "
                        + "and reserved_people+?<=capacity", body.visitorCount(), body.slotId(), body.visitorCount());
        if (changed != 1) {
            throw new ConflictException("预约时段名额不足");
        }
        String appointmentNo = "AP" + UUID.randomUUID().toString().replace("-", "").substring(0, 16).toUpperCase();
        jdbc.update("insert into appointments(appointment_no,user_id,slot_id,visitor_count,contact_name,contact_phone,contact_email,notes) "
                        + "values(?,?,?,?,?,?,?,?)", appointmentNo, userId, body.slotId(), body.visitorCount(), body.contactName().trim(),
                body.contactPhone().trim(), body.contactEmail().trim(), blank(body.notes()));
        long id = jdbc.queryForObject("select id from appointments where appointment_no=?", Long.class, appointmentNo);
        operationLogService.record(userId, "APPOINTMENT", "CREATE", "APPOINTMENT", String.valueOf(id));
        return ApiResponse.ok(appointmentById(id), "appointment-create");
    }

    @GetMapping("/me")
    public ApiResponse<ContentPage<AppointmentView>> mine(Authentication authentication,
                                                            @RequestParam(defaultValue = "1") int page,
                                                            @RequestParam(defaultValue = "20") int size,
                                                            @RequestParam(required = false) String status) {
        validatePage(page, size);
        long userId = actorId(authentication);
        String where = " where a.user_id=?" + (status == null || status.isBlank() ? "" : " and a.status=?");
        Object[] base = status == null || status.isBlank() ? new Object[] {userId} : new Object[] {userId, status};
        long total = jdbc.queryForObject("select count(*) from appointments a" + where, Long.class, base);
        Object[] args = java.util.Arrays.copyOf(base, base.length + 2);
        args[args.length - 2] = size;
        args[args.length - 1] = (page - 1) * size;
        List<AppointmentView> items = jdbc.query(selectAppointments() + where + " order by s.visit_date desc,s.start_time desc limit ? offset ?",
                (rs, rowNum) -> view(rs), args);
        return ApiResponse.ok(ContentPage.of(items, page, size, total), "my-appointments");
    }

    @GetMapping("/{id}")
    public ApiResponse<AppointmentView> detail(Authentication authentication, @PathVariable long id) {
        AppointmentView view = appointmentById(id);
        if (view.userId() != actorId(authentication) && !authentication.getAuthorities().stream()
                .anyMatch(authority -> "ROLE_ADMIN".equals(authority.getAuthority()))) {
            throw new ResourceNotFoundException("预约不存在");
        }
        return ApiResponse.ok(view, "appointment");
    }

    @PostMapping("/{id}/cancel")
    @Transactional
    public ApiResponse<AppointmentView> cancel(Authentication authentication, @PathVariable long id,
                                                @Valid @RequestBody(required = false) Cancel body) {
        long userId = actorId(authentication);
        AppointmentView appointment = appointmentById(id);
        if (appointment.userId() != userId) {
            throw new ResourceNotFoundException("预约不存在");
        }
        if (!"PENDING".equals(appointment.status()) && !"CONFIRMED".equals(appointment.status())) {
            throw new ConflictException("当前预约状态不可取消");
        }
        if (!appointment.startAt().minusHours(2).isAfter(LocalDateTime.now())) {
            throw new ConflictException("距开始时间不足两小时，无法自行取消");
        }
        jdbc.update("update appointments set status='CANCELLED',cancel_reason=?,cancelled_at=current_timestamp(3) where id=?",
                body == null ? null : blank(body.reason()), id);
        jdbc.update("update appointment_slots set reserved_people=greatest(0,reserved_people-?) where id=?", appointment.visitorCount(),
                appointment.slotId());
        operationLogService.record(userId, "APPOINTMENT", "CANCEL", "APPOINTMENT", String.valueOf(id));
        return ApiResponse.ok(appointmentById(id), "appointment-cancel");
    }

    static String selectAppointments() {
        return "select a.id,a.appointment_no,a.user_id,a.slot_id,a.visitor_count,a.contact_name,a.contact_phone,a.contact_email,"
                + "a.notes,a.status,a.cancel_reason,s.visit_date,s.start_time,s.end_time from appointments a "
                + "join appointment_slots s on s.id=a.slot_id";
    }

    static AppointmentView view(java.sql.ResultSet rs) throws java.sql.SQLException {
        LocalDate date = rs.getDate("visit_date").toLocalDate();
        LocalTime start = rs.getTime("start_time").toLocalTime();
        LocalTime end = rs.getTime("end_time").toLocalTime();
        return new AppointmentView(rs.getLong("id"), rs.getString("appointment_no"), rs.getLong("user_id"), rs.getLong("slot_id"),
                rs.getInt("visitor_count"), rs.getString("contact_name"), rs.getString("contact_phone"), rs.getString("contact_email"),
                empty(rs.getString("notes")), rs.getString("status"), empty(rs.getString("cancel_reason")), date, start, end,
                LocalDateTime.of(date, start));
    }

    AppointmentView appointmentById(long id) {
        List<AppointmentView> items = jdbc.query(selectAppointments() + " where a.id=?", (rs, rowNum) -> view(rs), id);
        if (items.isEmpty()) {
            throw new ResourceNotFoundException("预约不存在");
        }
        return items.get(0);
    }

    private Slot slotById(long slotId) {
        List<Slot> slots = jdbc.query("select id,visit_date,start_time,end_time,capacity,reserved_people,status from appointment_slots where id=?",
                (rs, rowNum) -> {
                    LocalDate date = rs.getDate("visit_date").toLocalDate();
                    LocalTime start = rs.getTime("start_time").toLocalTime();
                    return new Slot(rs.getLong("id"), date, LocalDateTime.of(date, start), rs.getInt("capacity"),
                            rs.getInt("reserved_people"), rs.getString("status"));
                }, slotId);
        if (slots.isEmpty()) throw new ResourceNotFoundException("预约时段不存在");
        return slots.get(0);
    }

    private static void validatePage(int page, int size) { if (page < 1 || size < 1 || size > 100) throw new IllegalArgumentException("page 必须大于 0，size 必须在 1 到 100 之间"); }
    private static long actorId(Authentication authentication) { return (Long) authentication.getPrincipal(); }
    private static String blank(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private static String empty(String value) { return value == null ? "" : value; }

    public record Create(@NotNull Long slotId, @Min(1) @Max(30) int visitorCount, @NotBlank @Size(max = 50) String contactName,
                         @NotBlank @Size(max = 20) String contactPhone, @Email @NotBlank String contactEmail, @Size(max = 500) String notes) {}
    public record Cancel(@Size(max = 255) String reason) {}
    record Slot(long id, LocalDate visitDate, LocalDateTime startAt, int capacity, int reservedPeople, String status) {}
    public record AppointmentView(long id, String appointmentNo, long userId, long slotId, int visitorCount, String contactName,
                                  String contactPhone, String contactEmail, String notes, String status, String cancelReason,
                                  LocalDate visitDate, LocalTime startTime, LocalTime endTime, LocalDateTime startAt) {}
}

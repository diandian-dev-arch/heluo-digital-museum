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
import java.time.Clock;
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
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/appointments")
public class AppointmentController {
    static final int OPEN_BOOKING_WINDOW_DAYS = 14;
    private final JdbcTemplate jdbc;
    private final OperationLogService operationLogService;
    private final Clock clock;

    AppointmentController(JdbcTemplate jdbc, OperationLogService operationLogService, Clock clock) {
        this.jdbc = jdbc;
        this.operationLogService = operationLogService;
        this.clock = clock;
    }

    @PostMapping
    @Transactional
    public ApiResponse<AppointmentView> create(Authentication authentication, @Valid @RequestBody Create body,
                                                @RequestHeader(value = "Idempotency-Key", required = false) String requestKey) {
        long userId = actorId(authentication);
        String idempotencyKey = normalizeIdempotencyKey(requestKey);
        Slot slot = slotByIdForUpdate(body.slotId());
        AppointmentView existing = findByCreationKey(userId, idempotencyKey);
        if (existing != null) {
            return ApiResponse.ok(existing, "appointment-create-retry");
        }
        LocalDateTime now = LocalDateTime.now(clock);
        LocalDate today = now.toLocalDate();
        if (slot.visitDate().isBefore(today)) {
            throw new ConflictException("参观日期不能早于今天");
        }
        if (slot.visitDate().isAfter(openWindowEnd(today))) {
            throw new ConflictException("APPOINTMENT_OUTSIDE_OPEN_WINDOW", "预约仅开放未来 14 天内的时段");
        }
        if (!"OPEN".equals(slot.status()) || !slot.startAt().isAfter(now)) {
            throw new ConflictException("预约时段不可用");
        }
        List<Long> active = jdbc.query("select id from appointments where user_id=? and slot_id=? "
                        + "and status in ('PENDING','CONFIRMED') for update",
                (rs, rowNum) -> rs.getLong(1), userId, body.slotId());
        if (!active.isEmpty()) {
            throw new ConflictException("DUPLICATE_ACTIVE_APPOINTMENT", "该用户已预约此参观时段");
        }
        int changed = jdbc.update("update appointment_slots set reserved_people=reserved_people+? where id=? and status='OPEN' "
                        + "and reserved_people+?<=capacity", body.visitorCount(), body.slotId(), body.visitorCount());
        if (changed != 1) {
            throw new ConflictException("预约时段名额不足");
        }
        String appointmentNo = "AP" + UUID.randomUUID().toString().replace("-", "").substring(0, 16).toUpperCase();
        jdbc.update("insert into appointments(appointment_no,user_id,slot_id,visitor_count,contact_name,contact_phone,contact_email,notes,creation_idempotency_key) "
                        + "values(?,?,?,?,?,?,?,?,?)", appointmentNo, userId, body.slotId(), body.visitorCount(), body.contactName().trim(),
                body.contactPhone().trim(), body.contactEmail().trim(), blank(body.notes()), idempotencyKey);
        long id = jdbc.queryForObject("select id from appointments where appointment_no=?", Long.class, appointmentNo);
        jdbc.update("insert into appointment_active_keys(user_id,slot_id,appointment_id) values(?,?,?)", userId, body.slotId(), id);
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
        List<AppointmentView> items = jdbc.query(selectAppointments() + where + " order by s.visit_date desc,s.start_time desc,a.id desc limit ? offset ?",
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
        AppointmentView appointment = appointmentAndSlotByIdForUpdate(id);
        if (appointment.userId() != userId) {
            throw new ResourceNotFoundException("预约不存在");
        }
        if (!"PENDING".equals(appointment.status()) && !"CONFIRMED".equals(appointment.status())) {
            throw new ConflictException("当前预约状态不可取消");
        }
        if (!appointment.startAt().minusHours(2).isAfter(LocalDateTime.now(clock))) {
            throw new ConflictException("距开始时间不足两小时，无法自行取消");
        }
        int changed = jdbc.update("update appointments set status='CANCELLED',cancel_reason=?,cancelled_at=current_timestamp(3) "
                        + "where id=? and status in ('PENDING','CONFIRMED')",
                body == null ? null : blank(body.reason()), id);
        if (changed != 1) throw new ConflictException("预约状态已变化，请刷新后重试");
        jdbc.update("delete from appointment_active_keys where appointment_id=?", id);
        int released = jdbc.update("update appointment_slots set reserved_people=reserved_people-? where id=? and reserved_people>=?",
                appointment.visitorCount(), appointment.slotId(), appointment.visitorCount());
        if (released != 1) throw new ConflictException("预约名额状态异常，请先核查后重试");
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

    private AppointmentView appointmentByIdForUpdate(long id) {
        List<AppointmentView> items = jdbc.query(selectAppointments() + " where a.id=? for update",
                (rs, rowNum) -> view(rs), id);
        if (items.isEmpty()) {
            throw new ResourceNotFoundException("预约不存在");
        }
        return items.get(0);
    }

    /** Keep cancellation in the same slot-then-appointment lock order as creation. */
    private AppointmentView appointmentAndSlotByIdForUpdate(long id) {
        List<Long> slotIds = jdbc.query("select slot_id from appointments where id=?", (rs, rowNum) -> rs.getLong(1), id);
        if (slotIds.isEmpty()) throw new ResourceNotFoundException("预约不存在");
        slotByIdForUpdate(slotIds.get(0));
        return appointmentByIdForUpdate(id);
    }

    private AppointmentView findByCreationKey(long userId, String key) {
        List<AppointmentView> items = jdbc.query(selectAppointments() + " where a.user_id=? and a.creation_idempotency_key=?",
                (rs, rowNum) -> view(rs), userId, key);
        return items.isEmpty() ? null : items.get(0);
    }

    private Slot slotByIdForUpdate(long slotId) {
        List<Slot> slots = jdbc.query("select id,visit_date,start_time,end_time,capacity,reserved_people,status from appointment_slots where id=? for update",
                (rs, rowNum) -> {
                    LocalDate date = rs.getDate("visit_date").toLocalDate();
                    LocalTime start = rs.getTime("start_time").toLocalTime();
                    return new Slot(rs.getLong("id"), date, LocalDateTime.of(date, start), rs.getInt("capacity"),
                            rs.getInt("reserved_people"), rs.getString("status"));
                }, slotId);
        if (slots.isEmpty()) throw new ResourceNotFoundException("预约时段不存在");
        return slots.get(0);
    }

    static LocalDate openWindowEnd(LocalDate today) {
        return today.plusDays(OPEN_BOOKING_WINDOW_DAYS - 1L);
    }

    private static String normalizeIdempotencyKey(String value) {
        if (value == null || value.isBlank()) return UUID.randomUUID().toString();
        String normalized = value.trim();
        if (normalized.length() > 64) throw new IllegalArgumentException("Idempotency-Key 不能超过 64 个字符");
        return normalized;
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

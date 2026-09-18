package com.heluo.museum.appointment;

import com.heluo.museum.common.api.ApiResponse;
import com.heluo.museum.common.audit.OperationLogService;
import com.heluo.museum.common.error.ConflictException;
import com.heluo.museum.common.error.ContentPage;
import com.heluo.museum.common.error.ResourceNotFoundException;
import com.heluo.museum.common.notification.NotificationService;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.validation.constraints.FutureOrPresent;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin")
public class AdminAppointmentController {
    private final JdbcTemplate jdbc;
    private final OperationLogService operationLogService;
    private final NotificationService notificationService;
    private final Clock clock;

    AdminAppointmentController(JdbcTemplate jdbc, OperationLogService operationLogService, NotificationService notificationService,
                               Clock clock) {
        this.jdbc = jdbc;
        this.operationLogService = operationLogService;
        this.notificationService = notificationService;
        this.clock = clock;
    }

    @GetMapping("/appointment-slots")
    public ApiResponse<ContentPage<SlotView>> listSlots(@RequestParam(defaultValue = "1") int page,
                                                         @RequestParam(defaultValue = "20") int size) {
        validatePage(page, size);
        long total = jdbc.queryForObject("select count(*) from appointment_slots", Long.class);
        List<SlotView> items = jdbc.query("select id,visit_date,start_time,end_time,capacity,reserved_people,status from appointment_slots "
                        + "order by visit_date,start_time limit ? offset ?", (rs, rowNum) -> slotView(rs), size, (page - 1) * size);
        return ApiResponse.ok(ContentPage.of(items, page, size, total), "admin-appointment-slots");
    }

    @PostMapping("/appointment-slots")
    @Transactional
    public ApiResponse<SlotView> createSlot(Authentication authentication, @Valid @RequestBody SlotInput body) {
        validateTimes(body.visitDate(), body.startTime(), body.endTime());
        if (jdbc.queryForObject("select count(*) from appointment_slots where visit_date=? and start_time=? and end_time=?", Integer.class,
                body.visitDate(), body.startTime(), body.endTime()) > 0) {
            throw new ConflictException("该预约时段已存在");
        }
        long actorId = actorId(authentication);
        jdbc.update("insert into appointment_slots(visit_date,start_time,end_time,capacity,status,created_by,updated_by) values(?,?,?,?,?,?,?)",
                body.visitDate(), body.startTime(), body.endTime(), body.capacity(), body.status(), actorId, actorId);
        long id = jdbc.queryForObject("select id from appointment_slots where visit_date=? and start_time=? and end_time=?", Long.class,
                body.visitDate(), body.startTime(), body.endTime());
        operationLogService.record(actorId, "APPOINTMENT", "SLOT_CREATE", "APPOINTMENT_SLOT", String.valueOf(id));
        return ApiResponse.ok(slotById(id), "admin-slot-create");
    }

    @PatchMapping("/appointment-slots/{id}")
    @Transactional
    public ApiResponse<SlotView> updateSlot(Authentication authentication, @PathVariable long id, @Valid @RequestBody SlotInput body) {
        SlotView current = slotByIdForUpdate(id);
        validateTimes(body.visitDate(), body.startTime(), body.endTime());
        if (body.capacity() < current.reservedPeople()) {
            throw new ConflictException("容量不能小于已预约人数");
        }
        jdbc.update("update appointment_slots set visit_date=?,start_time=?,end_time=?,capacity=?,status=?,updated_by=? where id=?",
                body.visitDate(), body.startTime(), body.endTime(), body.capacity(), body.status(), actorId(authentication), id);
        operationLogService.record(actorId(authentication), "APPOINTMENT", "SLOT_UPDATE", "APPOINTMENT_SLOT", String.valueOf(id));
        return ApiResponse.ok(slotById(id), "admin-slot-update");
    }

    @GetMapping("/appointments")
    public ApiResponse<ContentPage<AppointmentController.AppointmentView>> appointments(
            @RequestParam(defaultValue = "1") int page, @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String status) {
        validatePage(page, size);
        String where = status == null || status.isBlank() ? "" : " where a.status=?";
        Object[] base = status == null || status.isBlank() ? new Object[0] : new Object[] {status};
        long total = jdbc.queryForObject("select count(*) from appointments a" + where, Long.class, base);
        Object[] args = java.util.Arrays.copyOf(base, base.length + 2);
        args[args.length - 2] = size;
        args[args.length - 1] = (page - 1) * size;
        List<AppointmentController.AppointmentView> items = jdbc.query(AppointmentController.selectAppointments() + where
                + " order by s.visit_date desc,s.start_time desc,a.id desc limit ? offset ?", (rs, rowNum) -> AppointmentController.view(rs), args);
        return ApiResponse.ok(ContentPage.of(items, page, size, total), "admin-appointments");
    }

    @PostMapping("/appointments/{id}/confirm")
    @Transactional
    public ApiResponse<AppointmentController.AppointmentView> confirm(Authentication authentication, @PathVariable long id) {
        AppointmentController.AppointmentView appointment = appointmentAndSlotByIdForUpdate(id);
        if (!"PENDING".equals(appointment.status())) throw new ConflictException("只有待确认预约可以确认");
        int changed = jdbc.update("update appointments set status='CONFIRMED' where id=? and status='PENDING'", id);
        if (changed != 1) throw new ConflictException("预约状态已变化，请刷新后重试");
        operationLogService.record(actorId(authentication), "APPOINTMENT", "CONFIRM", "APPOINTMENT", String.valueOf(id));
        notificationService.sendStatusNotification(appointment.contactEmail(), "预约已确认", "您的线下参观预约已确认。");
        return ApiResponse.ok(appointmentById(id), "admin-appointment-confirm");
    }

    @PostMapping("/appointments/{id}/cancel")
    @Transactional
    public ApiResponse<AppointmentController.AppointmentView> cancel(Authentication authentication, @PathVariable long id,
                                                                       @Valid @RequestBody AdminCancel body) {
        AppointmentController.AppointmentView appointment = appointmentAndSlotByIdForUpdate(id);
        if (!"PENDING".equals(appointment.status()) && !"CONFIRMED".equals(appointment.status())) {
            throw new ConflictException("当前预约状态不可取消");
        }
        int changed = jdbc.update("update appointments set status='CANCELLED',cancel_reason=?,cancelled_at=current_timestamp(3) "
                        + "where id=? and status in ('PENDING','CONFIRMED')", body.reason().trim(), id);
        if (changed != 1) throw new ConflictException("预约状态已变化，请刷新后重试");
        jdbc.update("delete from appointment_active_keys where appointment_id=?", id);
        int released = jdbc.update("update appointment_slots set reserved_people=reserved_people-? where id=? and reserved_people>=?",
                appointment.visitorCount(), appointment.slotId(), appointment.visitorCount());
        if (released != 1) throw new ConflictException("预约名额状态异常，请先核查后重试");
        operationLogService.record(actorId(authentication), "APPOINTMENT", "ADMIN_CANCEL", "APPOINTMENT", String.valueOf(id));
        notificationService.sendStatusNotification(appointment.contactEmail(), "预约已取消", "您的线下参观预约已取消。");
        return ApiResponse.ok(appointmentById(id), "admin-appointment-cancel");
    }

    @PostMapping("/appointments/{id}/complete")
    @Transactional
    public ApiResponse<AppointmentController.AppointmentView> complete(Authentication authentication, @PathVariable long id) {
        AppointmentController.AppointmentView appointment = appointmentAndSlotByIdForUpdate(id);
        if (!"CONFIRMED".equals(appointment.status())) throw new ConflictException("只有已确认预约可以完成");
        if (LocalDateTime.of(appointment.visitDate(), appointment.endTime()).isAfter(LocalDateTime.now(clock))) {
            throw new ConflictException("参观时段尚未结束，不能标记完成");
        }
        int changed = jdbc.update("update appointments set status='COMPLETED',completed_at=current_timestamp(3) where id=? and status='CONFIRMED'", id);
        if (changed != 1) throw new ConflictException("预约状态已变化，请刷新后重试");
        jdbc.update("delete from appointment_active_keys where appointment_id=?", id);
        operationLogService.record(actorId(authentication), "APPOINTMENT", "COMPLETE", "APPOINTMENT", String.valueOf(id));
        return ApiResponse.ok(appointmentById(id), "admin-appointment-complete");
    }

    private AppointmentController.AppointmentView appointmentById(long id) {
        List<AppointmentController.AppointmentView> items = jdbc.query(AppointmentController.selectAppointments() + " where a.id=?",
                (rs, rowNum) -> AppointmentController.view(rs), id);
        if (items.isEmpty()) throw new ResourceNotFoundException("预约不存在");
        return items.get(0);
    }

    /**
     * Reservation creation locks its slot before any appointment row. All state
     * transitions follow that same order so a create/cancel/confirm race cannot
     * revive an appointment after its active key or capacity was released.
     */
    private AppointmentController.AppointmentView appointmentAndSlotByIdForUpdate(long id) {
        List<Long> slotIds = jdbc.query("select slot_id from appointments where id=?", (rs, rowNum) -> rs.getLong(1), id);
        if (slotIds.isEmpty()) throw new ResourceNotFoundException("预约不存在");
        slotByIdForUpdate(slotIds.get(0));
        return appointmentByIdForUpdate(id);
    }

    private AppointmentController.AppointmentView appointmentByIdForUpdate(long id) {
        List<AppointmentController.AppointmentView> items = jdbc.query(AppointmentController.selectAppointments() + " where a.id=? for update",
                (rs, rowNum) -> AppointmentController.view(rs), id);
        if (items.isEmpty()) throw new ResourceNotFoundException("预约不存在");
        return items.get(0);
    }
    private SlotView slotById(long id) {
        List<SlotView> slots = jdbc.query("select id,visit_date,start_time,end_time,capacity,reserved_people,status from appointment_slots where id=?",
                (rs, rowNum) -> slotView(rs), id);
        if (slots.isEmpty()) throw new ResourceNotFoundException("预约时段不存在");
        return slots.get(0);
    }
    private SlotView slotByIdForUpdate(long id) {
        List<SlotView> slots = jdbc.query("select id,visit_date,start_time,end_time,capacity,reserved_people,status from appointment_slots where id=? for update",
                (rs, rowNum) -> slotView(rs), id);
        if (slots.isEmpty()) throw new ResourceNotFoundException("预约时段不存在");
        return slots.get(0);
    }
    private static SlotView slotView(java.sql.ResultSet rs) throws java.sql.SQLException { return new SlotView(rs.getLong("id"),rs.getDate("visit_date").toLocalDate(),rs.getTime("start_time").toLocalTime(),rs.getTime("end_time").toLocalTime(),rs.getInt("capacity"),rs.getInt("reserved_people"),rs.getString("status")); }
    private void validateTimes(LocalDate date, LocalTime start, LocalTime end) { if (!LocalDateTime.of(date,start).isAfter(LocalDateTime.now(clock)) || !end.isAfter(start)) throw new IllegalArgumentException("预约时段必须在未来，且结束时间晚于开始时间"); }
    private static void validatePage(int page, int size) { if (page < 1 || size < 1 || size > 100) throw new IllegalArgumentException("page 必须大于 0，size 必须在 1 到 100 之间"); }
    private static long actorId(Authentication authentication) { return (Long) authentication.getPrincipal(); }
    public record SlotView(long id, LocalDate visitDate, LocalTime startTime, LocalTime endTime, int capacity, int reservedPeople, String status) {}
    public record SlotInput(@NotNull @FutureOrPresent LocalDate visitDate,@NotNull LocalTime startTime,@NotNull LocalTime endTime,@Min(1) @Max(500) int capacity,@NotBlank @jakarta.validation.constraints.Pattern(regexp="OPEN|CLOSED|CANCELLED") String status) {}
    public record AdminCancel(@NotBlank @Size(max=255) String reason) {}
}

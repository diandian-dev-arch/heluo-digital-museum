package com.heluo.museum.store;

import com.heluo.museum.common.api.ApiResponse;
import com.heluo.museum.common.audit.OperationLogService;
import com.heluo.museum.common.error.ConflictException;
import com.heluo.museum.common.error.ContentPage;
import com.heluo.museum.common.error.ResourceNotFoundException;
import com.heluo.museum.common.notification.NotificationService;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/orders")
public class OrderController {
    private final JdbcTemplate jdbc;
    private final NotificationService mail;
    private final OperationLogService audit;

    OrderController(JdbcTemplate jdbc, NotificationService mail, OperationLogService audit) {
        this.jdbc = jdbc;
        this.mail = mail;
        this.audit = audit;
    }

    @PostMapping
    @Transactional
    public ApiResponse<View> create(Authentication authentication, @Valid @RequestBody Create body,
                                    @RequestHeader("Idempotency-Key") @NotBlank @Size(max = 64) String idempotencyKey) {
        long userId = actorId(authentication);
        long cartId = cartForUpdate(userId);
        if (cartId < 0) {
            throw new ConflictException("购物车为空");
        }
        List<Line> lines = lockCartItems(cartId, body.cartItemIds());

        // The cart row serializes checkouts for one user. It also makes this normal read a fresh snapshot after a
        // waiting duplicate request acquires the lock, avoiding both stale reads and MySQL gap-lock deadlocks.
        View existing = findByCheckoutKey(userId, idempotencyKey);
        if (existing != null) {
            return ApiResponse.ok(existing, "order-create-retry");
        }
        if (lines.size() != body.cartItemIds().size()) {
            throw new ResourceNotFoundException("购物车项目不存在");
        }

        BigDecimal total = BigDecimal.ZERO;
        for (Line line : lines) {
            if (!"PUBLISHED".equals(line.status()) || line.stock() - line.locked() < line.quantity()) {
                throw new ConflictException("商品已下架或库存不足");
            }
            int changed = jdbc.update(
                    "update products set locked_stock=locked_stock+? where id=? and status='PUBLISHED' "
                            + "and stock_quantity-locked_stock>=?",
                    line.quantity(), line.productId(), line.quantity());
            if (changed != 1) {
                throw new ConflictException("商品库存发生变化，请刷新后重试");
            }
            total = total.add(line.price().multiply(BigDecimal.valueOf(line.quantity())));
        }

        String orderNo = "OR" + UUID.randomUUID().toString().replace("-", "").substring(0, 16).toUpperCase();
        jdbc.update("insert into orders(order_no,user_id,checkout_idempotency_key,payable_amount,notification_email,expires_at,status_updated_by) "
                        + "values(?,?,?,?,?,?,?)",
                orderNo, userId, idempotencyKey, total, body.notificationEmail().trim(),
                Timestamp.from(Instant.now().plus(30, ChronoUnit.MINUTES)), userId);
        long orderId = jdbc.queryForObject("select id from orders where order_no=?", Long.class, orderNo);
        for (Line line : lines) {
            jdbc.update("insert into order_items(order_id,product_id,product_sku_snapshot,product_name_snapshot,product_cover_url_snapshot,"
                            + "unit_price,quantity,subtotal_amount) values(?,?,?,?,?,?,?,?)",
                    orderId, line.productId(), line.sku(), line.name(), line.cover(), line.price(), line.quantity(),
                    line.price().multiply(BigDecimal.valueOf(line.quantity())));
        }
        String marks = marks(body.cartItemIds().size());
        jdbc.update("delete from cart_items where cart_id=? and id in (" + marks + ")", args(cartId, body.cartItemIds()));
        audit.record(userId, "ORDER", "CREATE", "ORDER", String.valueOf(orderId));
        return ApiResponse.ok(view(orderId), "order-create");
    }

    @GetMapping
    public ApiResponse<ContentPage<View>> list(Authentication authentication,
                                                @org.springframework.web.bind.annotation.RequestParam(defaultValue = "1") int page,
                                                @org.springframework.web.bind.annotation.RequestParam(defaultValue = "20") int size,
                                                @org.springframework.web.bind.annotation.RequestParam(required = false) String status) {
        validatePage(page, size);
        validateStatus(status);
        long userId = actorId(authentication);
        String where = " where user_id=?" + (status == null || status.isBlank() ? "" : " and status=?");
        Object[] filter = status == null || status.isBlank() ? new Object[] {userId} : new Object[] {userId, status};
        long total = jdbc.queryForObject("select count(*) from orders" + where, Long.class, filter);
        Object[] args = java.util.Arrays.copyOf(filter, filter.length + 2);
        args[args.length - 2] = size;
        args[args.length - 1] = (page - 1) * size;
        List<Long> ids = jdbc.query("select id from orders" + where + " order by created_at desc,id desc limit ? offset ?",
                (rs, rowNum) -> rs.getLong(1), args);
        return ApiResponse.ok(ContentPage.of(ids.stream().map(this::view).toList(), page, size, total), "orders");
    }

    @GetMapping("/{id}")
    public ApiResponse<View> detail(Authentication authentication, @PathVariable long id) {
        return ApiResponse.ok(owned(actorId(authentication), id), "order");
    }

    @PostMapping("/{id}/cancel")
    @Transactional
    public ApiResponse<View> cancel(Authentication authentication, @PathVariable long id) {
        View view = ownedForUpdate(actorId(authentication), id);
        if (!"PENDING_PAYMENT".equals(view.status())) {
            throw new ConflictException("当前订单不能取消");
        }
        expire(id, "用户取消");
        audit.record(view.userId(), "ORDER", "CANCEL", "ORDER", String.valueOf(id));
        return ApiResponse.ok(view(id), "order-cancel");
    }

    @PostMapping("/{id}/mock-payment")
    @Transactional(dontRollbackOn = PaymentExpiredException.class)
    public ApiResponse<View> pay(Authentication authentication, @PathVariable long id,
                                 @RequestHeader("Idempotency-Key") @NotBlank @Size(max = 64) String key) {
        View view = ownedForUpdate(actorId(authentication), id);
        List<Long> previous = jdbc.query("select order_id from payment_transactions where idempotency_key=? for update",
                (rs, rowNum) -> rs.getLong(1), key);
        if (!previous.isEmpty()) {
            if (previous.get(0) != id) {
                throw new ConflictException("幂等键已用于其他订单");
            }
            return ApiResponse.ok(view(id), "order-payment-retry");
        }
        if (!"PENDING_PAYMENT".equals(view.status())) {
            throw new ConflictException("订单不是待支付状态");
        }
        if (!view.expiresAt().isAfter(Instant.now())) {
            expire(id, "支付超时");
            audit.record(view.userId(), "ORDER", "EXPIRE", "ORDER", String.valueOf(id));
            throw new PaymentExpiredException();
        }
        for (Item item : view.items()) {
            int changed = jdbc.update("update products set stock_quantity=stock_quantity-?,locked_stock=locked_stock-? "
                            + "where id=? and stock_quantity>=? and locked_stock>=?",
                    item.quantity(), item.quantity(), item.productId(), item.quantity(), item.quantity());
            if (changed != 1) {
                throw new ConflictException("库存状态异常");
            }
        }
        String paymentNo = "PM" + UUID.randomUUID().toString().replace("-", "").substring(0, 16).toUpperCase();
        jdbc.update("insert into payment_transactions(payment_no,order_id,idempotency_key,amount,status,paid_at) "
                        + "values(?,?,?,?,'SUCCEEDED',current_timestamp(3))",
                paymentNo, id, key, view.payableAmount());
        jdbc.update("update orders set status='PAID',paid_at=current_timestamp(3),status_updated_by=?,"
                        + "status_updated_at=current_timestamp(3) where id=?",
                view.userId(), id);
        audit.record(view.userId(), "ORDER", "MOCK_PAYMENT", "ORDER", String.valueOf(id));
        mail.sendStatusNotification(view.notificationEmail(), "模拟支付成功", "订单 " + view.orderNo() + " 已支付。");
        return ApiResponse.ok(view(id), "order-payment");
    }

    private List<Line> lockCartItems(long cartId, List<Long> itemIds) {
        String marks = marks(itemIds.size());
        return jdbc.query("select ci.id,ci.product_id,ci.quantity,p.sku,p.name,p.price,p.stock_quantity,p.locked_stock,"
                        + "p.status,p.cover_image_url from cart_items ci join products p on p.id=ci.product_id "
                        + "where ci.cart_id=? and ci.id in (" + marks + ") for update",
                (rs, rowNum) -> new Line(rs.getLong(1), rs.getLong(2), rs.getInt(3), rs.getString(4), rs.getString(5),
                        rs.getBigDecimal(6), rs.getInt(7), rs.getInt(8), rs.getString(9), rs.getString(10)),
                args(cartId, itemIds));
    }

    private View owned(long userId, long id) {
        View view = view(id);
        if (view.userId() != userId) {
            throw new ResourceNotFoundException("订单不存在");
        }
        return view;
    }

    private View ownedForUpdate(long userId, long id) {
        Long ownerId = jdbc.queryForObject("select user_id from orders where id=? for update", Long.class, id);
        if (ownerId != userId) {
            throw new ResourceNotFoundException("订单不存在");
        }
        return view(id);
    }

    private View findByCheckoutKey(long userId, String idempotencyKey) {
        List<Long> ids = jdbc.query("select id from orders where user_id=? and checkout_idempotency_key=?",
                (rs, rowNum) -> rs.getLong(1), userId, idempotencyKey);
        return ids.isEmpty() ? null : view(ids.get(0));
    }

    private void expire(long id, String reason) {
        View view = view(id);
        if (!"PENDING_PAYMENT".equals(view.status())) {
            return;
        }
        for (Item item : view.items()) {
            jdbc.update("update products set locked_stock=greatest(0,locked_stock-?) where id=?", item.quantity(), item.productId());
        }
        jdbc.update("update orders set status='CANCELLED',cancelled_at=current_timestamp(3),cancel_reason=?,"
                        + "status_updated_at=current_timestamp(3) where id=?",
                reason, id);
    }

    private View view(long id) {
        List<View> views = jdbc.query("select id,order_no,user_id,status,payable_amount,notification_email,expires_at "
                        + "from orders where id=?",
                (rs, rowNum) -> new View(rs.getLong(1), rs.getString(2), rs.getLong(3), rs.getString(4),
                        rs.getBigDecimal(5), rs.getString(6), rs.getTimestamp(7).toInstant(), items(rs.getLong(1))), id);
        if (views.isEmpty()) {
            throw new ResourceNotFoundException("订单不存在");
        }
        return views.get(0);
    }

    private List<Item> items(long orderId) {
        return jdbc.query("select product_id,product_name_snapshot,product_cover_url_snapshot,unit_price,quantity,subtotal_amount "
                        + "from order_items where order_id=? order by id",
                (rs, rowNum) -> new Item(rs.getLong(1), rs.getString(2), rs.getString(3), rs.getBigDecimal(4),
                        rs.getInt(5), rs.getBigDecimal(6)), orderId);
    }

    private long cart(long userId) {
        return jdbc.query("select id from carts where user_id=?", (rs, rowNum) -> rs.getLong(1), userId)
                .stream().findFirst().orElse(-1L);
    }

    private long cartForUpdate(long userId) {
        return jdbc.query("select id from carts where user_id=? for update", (rs, rowNum) -> rs.getLong(1), userId)
                .stream().findFirst().orElse(-1L);
    }

    private static String marks(int size) {
        return String.join(",", Collections.nCopies(size, "?"));
    }

    private static Object[] args(long cartId, List<Long> ids) {
        Object[] values = new Object[ids.size() + 1];
        values[0] = cartId;
        for (int index = 0; index < ids.size(); index += 1) {
            values[index + 1] = ids.get(index);
        }
        return values;
    }

    private static long actorId(Authentication authentication) {
        return (Long) authentication.getPrincipal();
    }

    private static void validatePage(int page, int size) {
        if (page < 1 || size < 1 || size > 100) {
            throw new IllegalArgumentException("page 必须大于 0，size 必须在 1 到 100 之间");
        }
    }

    private static void validateStatus(String status) {
        if (status != null && !status.isBlank()
                && !Set.of("PENDING_PAYMENT", "PAID", "CANCELLED", "COMPLETED").contains(status)) {
            throw new IllegalArgumentException("订单状态不合法");
        }
    }

    record Line(long cartItemId, long productId, int quantity, String sku, String name, BigDecimal price, int stock,
                int locked, String status, String cover) {
    }

    public record Create(@NotEmpty List<Long> cartItemIds, @NotBlank @Email String notificationEmail) {
    }

    public record Item(long productId, String name, String coverImageUrl, BigDecimal unitPrice, int quantity,
                       BigDecimal subtotalAmount) {
    }

    public record View(long id, String orderNo, long userId, String status, BigDecimal payableAmount,
                       String notificationEmail, Instant expiresAt, List<Item> items) {
    }
}

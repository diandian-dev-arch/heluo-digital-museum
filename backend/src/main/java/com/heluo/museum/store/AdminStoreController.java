package com.heluo.museum.store;

import com.heluo.museum.common.api.ApiResponse;
import com.heluo.museum.common.audit.OperationLogService;
import com.heluo.museum.common.error.ConflictException;
import com.heluo.museum.common.error.ContentPage;
import com.heluo.museum.common.error.ResourceNotFoundException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
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
public class AdminStoreController {
    private final JdbcTemplate jdbc;
    private final OperationLogService audit;

    public AdminStoreController(JdbcTemplate jdbc, OperationLogService audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    @GetMapping("/products")
    public ApiResponse<ContentPage<ProductAdminView>> products(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "all") String deleted,
            @RequestParam(required = false) String status) {
        validatePage(page, size);
        if (!"all".equals(deleted) && !"true".equals(deleted) && !"false".equals(deleted)) {
            throw new IllegalArgumentException("deleted 参数不合法");
        }
        if (status != null && !status.isBlank()
                && !Set.of("DRAFT", "PUBLISHED", "WITHDRAWN").contains(status)) {
            throw new IllegalArgumentException("商品状态不合法");
        }
        List<String> clauses = new ArrayList<>();
        List<Object> filters = new ArrayList<>();
        if (!"all".equals(deleted)) clauses.add("deleted_at is " + ("true".equals(deleted) ? "not null" : "null"));
        if (status != null && !status.isBlank()) { clauses.add("status=?"); filters.add(status); }
        String where = clauses.isEmpty() ? "" : " where " + String.join(" and ", clauses);
        long total = jdbc.queryForObject("select count(*) from products" + where, Long.class, filters.toArray());
        List<Object> args = new ArrayList<>(filters);
        args.add(size);
        args.add((page - 1) * size);
        List<ProductAdminView> items = jdbc.query("select id,sku,name,slug,summary,description,price,stock_quantity,locked_stock,cover_image_url,status,deleted_at "
                        + "from products" + where + " order by updated_at desc,id desc limit ? offset ?",
                (rs, n) -> view(rs), args.toArray());
        return ApiResponse.ok(ContentPage.of(items, page, size, total), "admin-products");
    }

    @PostMapping("/products")
    public ApiResponse<ProductAdminView> create(Authentication authentication, @Valid @RequestBody ProductInput body) {
        if (count("select count(*) from products where sku=? or slug=?", body.sku(), body.slug()) > 0) {
            throw new ConflictException("SKU 或 URL 标识已存在");
        }
        long actor = actorId(authentication);
        jdbc.update("insert into products(sku,name,slug,summary,description,price,stock_quantity,cover_image_url,status,created_by,updated_by) "
                        + "values(?,?,?,?,?,?,?,?, 'DRAFT',?,?)", body.sku(), body.name(), body.slug(), blank(body.summary()),
                blank(body.description()), body.price(), body.stockQuantity(), blank(body.coverImageUrl()), actor, actor);
        long id = jdbc.queryForObject("select id from products where sku=?", Long.class, body.sku());
        audit.record(actor, "STORE", "PRODUCT_CREATE", "PRODUCT", String.valueOf(id));
        return ApiResponse.ok(product(id), "admin-product-create");
    }

    @PatchMapping("/products/{id}")
    public ApiResponse<ProductAdminView> update(Authentication authentication, @PathVariable long id,
                                                @Valid @RequestBody ProductInput body) {
        ProductAdminView old = product(id);
        if (old.deleted()) throw new ConflictException("已删除商品必须先恢复");
        if (count("select count(*) from products where (sku=? or slug=?) and id<>?", body.sku(), body.slug(), id) > 0) {
            throw new ConflictException("SKU 或 URL 标识已存在");
        }
        long actor = actorId(authentication);
        int changed = jdbc.update("update products set sku=?,name=?,slug=?,summary=?,description=?,price=?,stock_quantity=?,cover_image_url=?,updated_by=? "
                        + "where id=? and deleted_at is null and locked_stock<=?", body.sku(), body.name(), body.slug(), blank(body.summary()),
                blank(body.description()), body.price(), body.stockQuantity(), blank(body.coverImageUrl()), actor, id, body.stockQuantity());
        if (changed == 0) throw new ConflictException("库存不能小于已锁定库存");
        audit.record(actor, "STORE", "PRODUCT_UPDATE", "PRODUCT", String.valueOf(id));
        return ApiResponse.ok(product(id), "admin-product-update");
    }

    @PatchMapping("/products/{id}/stock")
    public ApiResponse<ProductAdminView> updateStock(Authentication authentication, @PathVariable long id,
                                                     @Valid @RequestBody StockInput body) {
        ProductAdminView old = product(id);
        if (old.deleted()) throw new ConflictException("已删除商品必须先恢复");
        long actor = actorId(authentication);
        int changed = jdbc.update("update products set stock_quantity=?,updated_by=? where id=? and deleted_at is null and locked_stock<=?",
                body.stockQuantity(), actor, id, body.stockQuantity());
        if (changed == 0) throw new ConflictException("库存不能小于已锁定库存");
        audit.record(actor, "STORE", "PRODUCT_STOCK_UPDATE", "PRODUCT", String.valueOf(id));
        return ApiResponse.ok(product(id), "admin-product-stock-update");
    }

    @PostMapping("/products/{id}/on-shelf")
    public ApiResponse<ProductAdminView> onShelf(Authentication authentication, @PathVariable long id) {
        ProductAdminView product = product(id);
        if (product.deleted()) throw new ConflictException("已删除商品不能上架");
        jdbc.update("update products set status='PUBLISHED',published_at=current_timestamp(3),updated_by=? where id=?",
                actorId(authentication), id);
        return ApiResponse.ok(product(id), "admin-product-on-shelf");
    }

    @PostMapping("/products/{id}/off-shelf")
    public ApiResponse<ProductAdminView> offShelf(Authentication authentication, @PathVariable long id) {
        ProductAdminView product = product(id);
        if (product.deleted()) throw new ConflictException("已删除商品不能下架");
        jdbc.update("update products set status='WITHDRAWN',updated_by=? where id=?", actorId(authentication), id);
        return ApiResponse.ok(product(id), "admin-product-off-shelf");
    }

    @DeleteMapping("/products/{id}")
    public ApiResponse<ProductAdminView> delete(Authentication authentication, @PathVariable long id) {
        ProductAdminView product = product(id);
        if (product.deleted()) throw new ConflictException("商品已在回收站");
        long actor = actorId(authentication);
        jdbc.update("update products set deleted_at=current_timestamp(3),deleted_by=?,updated_by=? where id=?", actor, actor, id);
        audit.record(actor, "STORE", "PRODUCT_DELETE", "PRODUCT", String.valueOf(id));
        return ApiResponse.ok(product(id), "admin-product-delete");
    }

    @PostMapping("/products/{id}/restore")
    public ApiResponse<ProductAdminView> restore(Authentication authentication, @PathVariable long id) {
        ProductAdminView product = product(id);
        if (!product.deleted()) throw new ConflictException("商品不在回收站");
        jdbc.update("update products set deleted_at=null,deleted_by=null,status='WITHDRAWN',updated_by=? where id=?", actorId(authentication), id);
        return ApiResponse.ok(product(id), "admin-product-restore");
    }

    @GetMapping("/orders")
    public ApiResponse<ContentPage<OrderAdminView>> orders(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String status) {
        validatePage(page, size);
        if (status != null && !status.isBlank()
                && !Set.of("PENDING_PAYMENT", "PAID", "CANCELLED", "COMPLETED").contains(status)) {
            throw new IllegalArgumentException("订单状态不合法");
        }
        String where = status == null || status.isBlank() ? "" : " where status=?";
        Object[] filter = status == null || status.isBlank() ? new Object[0] : new Object[] {status};
        long total = jdbc.queryForObject("select count(*) from orders" + where, Long.class, filter);
        Object[] args = java.util.Arrays.copyOf(filter, filter.length + 2);
        args[args.length - 2] = size;
        args[args.length - 1] = (page - 1) * size;
        List<OrderAdminView> items = jdbc.query("select id,order_no,user_id,status,payable_amount,notification_email,created_at from orders"
                        + where + " order by created_at desc,id desc limit ? offset ?", (rs, n) -> orderView(rs), args);
        return ApiResponse.ok(ContentPage.of(items, page, size, total), "admin-orders");
    }

    @PostMapping("/orders/{id}/complete")
    public ApiResponse<OrderAdminView> complete(Authentication authentication, @PathVariable long id) {
        OrderAdminView order = order(id);
        if (!"PAID".equals(order.status())) throw new ConflictException("只有已支付订单可以完成");
        long actor = actorId(authentication);
        jdbc.update("update orders set status='COMPLETED',completed_at=current_timestamp(3),status_updated_by=? where id=?", actor, id);
        audit.record(actor, "STORE", "ORDER_COMPLETE", "ORDER", String.valueOf(id));
        return ApiResponse.ok(order(id), "admin-order-complete");
    }

    private long count(String sql, Object... args) { return jdbc.queryForObject(sql, Long.class, args); }

    private ProductAdminView product(long id) {
        List<ProductAdminView> rows = jdbc.query("select id,sku,name,slug,summary,description,price,stock_quantity,locked_stock,cover_image_url,status,deleted_at from products where id=?",
                (rs, n) -> view(rs), id);
        if (rows.isEmpty()) throw new ResourceNotFoundException("商品不存在");
        return rows.get(0);
    }

    private ProductAdminView view(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new ProductAdminView(rs.getLong(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5),
                rs.getString(6), rs.getBigDecimal(7).toPlainString(), rs.getInt(8), rs.getInt(9), rs.getString(10),
                rs.getString(11), rs.getTimestamp(12) != null);
    }

    private OrderAdminView order(long id) {
        List<OrderAdminView> rows = jdbc.query("select id,order_no,user_id,status,payable_amount,notification_email,created_at from orders where id=?",
                (rs, n) -> orderView(rs), id);
        if (rows.isEmpty()) throw new ResourceNotFoundException("订单不存在");
        return rows.get(0);
    }

    private static OrderAdminView orderView(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new OrderAdminView(rs.getLong(1), rs.getString(2), rs.getLong(3), rs.getString(4), rs.getBigDecimal(5).toPlainString(),
                rs.getString(6), rs.getTimestamp(7).toInstant().toString());
    }

    private static void validatePage(int page, int size) {
        if (page < 1 || size < 1 || size > 100) throw new IllegalArgumentException("page 必须大于 0，size 必须在 1 到 100 之间");
    }

    private static long actorId(Authentication authentication) { return (Long) authentication.getPrincipal(); }
    private static String blank(String value) { return value == null || value.isBlank() ? null : value.trim(); }

    public record ProductAdminView(long id, String sku, String name, String slug, String summary, String description,
                                   String price, int stockQuantity, int lockedStock, String coverImageUrl, String status,
                                   boolean deleted) {}
    public record OrderAdminView(long id, String orderNo, long userId, String status, String payableAmount,
                                 String notificationEmail, String createdAt) {}
    public record ProductInput(@NotBlank @Size(max = 64) String sku, @NotBlank @Size(max = 150) String name,
                               @NotBlank @Pattern(regexp = "[a-z0-9-]{3,180}") String slug, @Size(max = 500) String summary,
                               String description, @NotNull @DecimalMin("0.01") BigDecimal price, @Min(0) int stockQuantity,
                               @Size(max = 500) String coverImageUrl) {}
    public record StockInput(@Min(0) int stockQuantity) {}
}

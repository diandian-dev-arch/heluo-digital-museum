package com.heluo.museum.store;

import com.heluo.museum.common.api.ApiResponse;
import com.heluo.museum.common.error.ConflictException;
import com.heluo.museum.common.error.ResourceNotFoundException;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/cart")
public class CartController {
    private final JdbcTemplate jdbc;

    CartController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    public ApiResponse<List<Item>> get(Authentication authentication) {
        return ApiResponse.ok(items(cartId(actorId(authentication), false)), "cart");
    }

    @PostMapping("/items")
    @Transactional
    public ApiResponse<List<Item>> add(Authentication authentication, @Valid @RequestBody Change body) {
        long userId = actorId(authentication);
        Product product = product(body.productId());
        requirePurchasable(product, body.quantity());
        long cartId = cartId(userId, true);
        Integer current = jdbc.query("select quantity from cart_items where cart_id=? and product_id=?",
                        (rs, rowNum) -> rs.getInt(1), cartId, body.productId())
                .stream().findFirst().orElse(null);
        int amount = (current == null ? 0 : current) + body.quantity();
        if (amount > 10) {
            throw new ConflictException("同一商品最多购买 10 件");
        }
        requirePurchasable(product, amount);
        if (current == null) {
            jdbc.update("insert into cart_items(cart_id,product_id,quantity) values(?,?,?)", cartId, body.productId(), body.quantity());
        } else {
            jdbc.update("update cart_items set quantity=? where cart_id=? and product_id=?", amount, cartId, body.productId());
        }
        return ApiResponse.ok(items(cartId), "cart-add");
    }

    @PatchMapping("/items/{id}")
    public ApiResponse<List<Item>> update(Authentication authentication, @PathVariable long id,
                                          @Valid @RequestBody Quantity body) {
        long cartId = cartId(actorId(authentication), false);
        Product product = productForCartItem(cartId, id);
        requirePurchasable(product, body.quantity());
        int changed = jdbc.update("update cart_items set quantity=? where id=? and cart_id=?", body.quantity(), id, cartId);
        if (changed != 1) {
            throw new ResourceNotFoundException("购物车项目不存在");
        }
        return ApiResponse.ok(items(cartId), "cart-update");
    }

    @DeleteMapping("/items/{id}")
    public ApiResponse<List<Item>> delete(Authentication authentication, @PathVariable long id) {
        long cartId = cartId(actorId(authentication), false);
        int changed = jdbc.update("delete from cart_items where id=? and cart_id=?", id, cartId);
        if (changed != 1) {
            throw new ResourceNotFoundException("购物车项目不存在");
        }
        return ApiResponse.ok(items(cartId), "cart-delete");
    }

    private long cartId(long userId, boolean create) {
        Long id = jdbc.query("select id from carts where user_id=?", (rs, rowNum) -> rs.getLong(1), userId)
                .stream().findFirst().orElse(null);
        if (id == null && create) {
            jdbc.update("insert into carts(user_id) values(?)", userId);
            id = jdbc.queryForObject("select id from carts where user_id=?", Long.class, userId);
        }
        return id == null ? -1L : id;
    }

    private Product productForCartItem(long cartId, long itemId) {
        List<Product> products = jdbc.query("select p.id,p.name,p.slug,p.price,p.stock_quantity,p.locked_stock,p.status,p.cover_image_url "
                        + "from cart_items ci join products p on p.id=ci.product_id "
                        + "where ci.id=? and ci.cart_id=? and p.deleted_at is null",
                (rs, rowNum) -> product(rs), itemId, cartId);
        if (products.isEmpty()) {
            throw new ResourceNotFoundException("购物车项目不存在");
        }
        return products.get(0);
    }

    private Product product(long id) {
        List<Product> products = jdbc.query("select id,name,slug,price,stock_quantity,locked_stock,status,cover_image_url "
                        + "from products where id=? and deleted_at is null",
                (rs, rowNum) -> product(rs), id);
        if (products.isEmpty()) {
            throw new ResourceNotFoundException("商品不存在");
        }
        return products.get(0);
    }

    private static Product product(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Product(rs.getLong(1), rs.getString(2), rs.getString(3), rs.getBigDecimal(4), rs.getInt(5),
                rs.getInt(6), rs.getString(7), rs.getString(8));
    }

    private static void requirePurchasable(Product product, int quantity) {
        if (!"PUBLISHED".equals(product.status()) || product.available() < quantity) {
            throw new ConflictException("商品不可购买或库存不足");
        }
    }

    private List<Item> items(long cartId) {
        if (cartId < 0) {
            return List.of();
        }
        return jdbc.query("select ci.id,ci.product_id,ci.quantity,p.name,p.slug,p.price,p.stock_quantity,p.locked_stock,"
                        + "p.status,p.cover_image_url from cart_items ci join products p on p.id=ci.product_id "
                        + "where ci.cart_id=? order by ci.id",
                (rs, rowNum) -> new Item(rs.getLong(1), rs.getLong(2), rs.getInt(3), rs.getString(4), rs.getString(5),
                        rs.getBigDecimal(6).toPlainString(), Math.max(0, rs.getInt(7) - rs.getInt(8)),
                        rs.getString(9), rs.getString(10)), cartId);
    }

    private static long actorId(Authentication authentication) {
        return (Long) authentication.getPrincipal();
    }

    record Product(long id, String name, String slug, BigDecimal price, int stock, int locked, String status, String cover) {
        int available() {
            return Math.max(0, stock - locked);
        }
    }

    public record Item(long id, long productId, int quantity, String name, String slug, String price,
                       int availableStock, String status, String coverImageUrl) {
    }

    public record Change(@NotNull Long productId, @Min(1) @Max(10) int quantity) {
    }

    public record Quantity(@Min(1) @Max(10) int quantity) {
    }
}

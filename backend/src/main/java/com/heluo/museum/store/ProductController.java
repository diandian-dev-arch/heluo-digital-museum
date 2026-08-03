package com.heluo.museum.store;

import com.heluo.museum.common.api.ApiResponse;
import com.heluo.museum.common.error.ResourceNotFoundException;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/products")
public class ProductController {
    private final JdbcTemplate jdbc;
    ProductController(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    @GetMapping public ApiResponse<List<Card>> list() {
        return ApiResponse.ok(jdbc.query("select id,slug,name,summary,price,stock_quantity,locked_stock,cover_image_url from products where status='PUBLISHED' and deleted_at is null order by published_at desc,id desc",
                (r,n)->new Card(r.getLong(1),r.getString(2),r.getString(3),empty(r.getString(4)),r.getBigDecimal(5).toPlainString(),Math.max(0,r.getInt(6)-r.getInt(7)),empty(r.getString(8)))),"products");
    }
    @GetMapping("/{slug}") public ApiResponse<Detail> detail(@PathVariable String slug) {
        List<Detail> rows=jdbc.query("select id,slug,name,summary,description,price,stock_quantity,locked_stock,cover_image_url from products where slug=? and status='PUBLISHED' and deleted_at is null",(r,n)->new Detail(r.getLong(1),r.getString(2),r.getString(3),empty(r.getString(4)),empty(r.getString(5)),r.getBigDecimal(6).toPlainString(),Math.max(0,r.getInt(7)-r.getInt(8)),empty(r.getString(9))),slug);
        if(rows.isEmpty())throw new ResourceNotFoundException("商品不存在或已下架");return ApiResponse.ok(rows.get(0),"product");
    }
    private static String empty(String value){return value==null?"":value;}
    public record Card(long id,String slug,String name,String summary,String price,int availableStock,String coverImageUrl){}
    public record Detail(long id,String slug,String name,String summary,String description,String price,int availableStock,String coverImageUrl){}
}

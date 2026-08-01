package com.heluo.museum.content;

import com.heluo.museum.common.api.ApiResponse;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/categories")
public class CategoryController {
  private final JdbcTemplate jdbc;
  CategoryController(JdbcTemplate jdbc) { this.jdbc = jdbc; }
  @GetMapping
  public ApiResponse<List<Category>> list() {
    var items=jdbc.query("select id,code,name,description,sort_order from categories where enabled=1 order by sort_order,id",(rs,row)->new Category(rs.getLong("id"),rs.getString("code"),rs.getString("name"),rs.getString("description"),rs.getInt("sort_order")));
    return ApiResponse.ok(items,"categories");
  }
  public record Category(long id,String code,String name,String description,int sortOrder) {}
}

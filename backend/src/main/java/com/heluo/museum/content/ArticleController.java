package com.heluo.museum.content;

import com.heluo.museum.common.api.ApiResponse;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/v1/articles")
public class ArticleController {
  private final JdbcTemplate jdbc; ArticleController(JdbcTemplate jdbc){this.jdbc=jdbc;}
  @GetMapping public ApiResponse<List<Card>> list(){return ApiResponse.ok(jdbc.query("select a.slug,a.title,a.summary,a.cover_image_url,c.name category_name from articles a join categories c on c.id=a.category_id where a.status='PUBLISHED' and a.deleted_at is null and c.enabled=1 order by a.published_at desc,a.id desc",(rs,n)->new Card(rs.getString("slug"),rs.getString("title"),rs.getString("summary"),rs.getString("cover_image_url"),rs.getString("category_name"))),"articles");}
  @GetMapping("/{slug}") public ApiResponse<java.util.Map<String,Object>> detail(@PathVariable String slug){var r=jdbc.queryForMap("select a.slug,a.title,a.summary,a.content,a.cover_image_url,a.author_display,a.published_at,c.code,c.name from articles a join categories c on c.id=a.category_id where a.slug=? and a.status='PUBLISHED' and a.deleted_at is null and c.enabled=1",slug);return ApiResponse.ok(java.util.Map.of("slug",r.get("slug"),"title",r.get("title"),"summary",r.get("summary"),"content",r.get("content"),"coverImageUrl",r.get("cover_image_url")==null?"":r.get("cover_image_url"),"authorDisplay",r.get("author_display")==null?"":r.get("author_display"),"category",java.util.Map.of("code",r.get("code"),"name",r.get("name"))),"article");}  public record Card(String slug,String title,String summary,String coverImageUrl,String categoryName){}
}


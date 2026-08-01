package com.heluo.museum.content;

import com.heluo.museum.common.api.ApiResponse;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController @RequestMapping("/api/v1/artifacts")
public class ArtifactController {
  private final JdbcTemplate jdbc; ArtifactController(JdbcTemplate jdbc){this.jdbc=jdbc;}
  @GetMapping public ApiResponse<List<Card>> list(@RequestParam(required=false) String categoryCode) {
    String sql="select a.slug,a.title,a.summary,a.period,a.material,a.cover_image_url,c.name category_name from artifacts a join categories c on c.id=a.category_id where a.status='PUBLISHED' and a.deleted_at is null and c.enabled=1"+(categoryCode==null?"":" and c.code=?")+" order by a.published_at desc,a.id desc";
    var items=categoryCode==null?jdbc.query(sql,(rs,n)->new Card(rs.getString("slug"),rs.getString("title"),rs.getString("summary"),rs.getString("period"),rs.getString("material"),rs.getString("cover_image_url"),rs.getString("category_name"))):jdbc.query(sql,(rs,n)->new Card(rs.getString("slug"),rs.getString("title"),rs.getString("summary"),rs.getString("period"),rs.getString("material"),rs.getString("cover_image_url"),rs.getString("category_name")),categoryCode);
    return ApiResponse.ok(items,"artifacts");
  }
  public record Card(String slug,String title,String summary,String period,String material,String coverImageUrl,String categoryName){}
}

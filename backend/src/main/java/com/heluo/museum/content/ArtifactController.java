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
  @GetMapping("/{slug}") public ApiResponse<java.util.Map<String,Object>> detail(@org.springframework.web.bind.annotation.PathVariable String slug) {
    var row=jdbc.queryForMap("select a.slug,a.title,a.summary,a.content,a.period,a.material,a.dimensions,a.collection_location,a.cover_image_url,c.code category_code,c.name category_name from artifacts a join categories c on c.id=a.category_id where a.slug=? and a.status='PUBLISHED' and a.deleted_at is null and c.enabled=1",slug);
    return ApiResponse.ok(java.util.Map.of("slug",row.get("slug"),"title",row.get("title"),"summary",row.get("summary")==null?"":row.get("summary"),"content",row.get("content"),"period",row.get("period")==null?"":row.get("period"),"material",row.get("material")==null?"":row.get("material"),"dimensions",row.get("dimensions")==null?"":row.get("dimensions"),"collectionLocation",row.get("collection_location")==null?"":row.get("collection_location"),"coverImageUrl",row.get("cover_image_url")==null?"":row.get("cover_image_url"),"category",java.util.Map.of("code",row.get("category_code"),"name",row.get("category_name"))),"artifact");
  }  public record Card(String slug,String title,String summary,String period,String material,String coverImageUrl,String categoryName){}
}


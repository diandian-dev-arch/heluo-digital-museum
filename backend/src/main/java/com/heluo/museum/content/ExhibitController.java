package com.heluo.museum.content;
import com.heluo.museum.common.api.ApiResponse;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/v1/exhibits") public class ExhibitController {
 private final JdbcTemplate jdbc; ExhibitController(JdbcTemplate jdbc){this.jdbc=jdbc;}
 @GetMapping public ApiResponse<List<Card>> list(){return ApiResponse.ok(jdbc.query("select e.slug,e.title,e.summary,e.cover_image_url,a.slug artifact_slug,a.title artifact_title from exhibits_3d e join artifacts a on a.id=e.artifact_id where e.status='PUBLISHED' and e.deleted_at is null and a.status='PUBLISHED' and a.deleted_at is null order by e.published_at desc,e.id desc",(r,n)->new Card(r.getString("slug"),r.getString("title"),r.getString("summary"),r.getString("cover_image_url"),r.getString("artifact_slug"),r.getString("artifact_title"))),"exhibits");}
 public record Card(String slug,String title,String summary,String coverImageUrl,String artifactSlug,String artifactTitle){}
}

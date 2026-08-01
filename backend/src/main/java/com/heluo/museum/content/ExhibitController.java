package com.heluo.museum.content;
import com.heluo.museum.common.api.ApiResponse;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
@RestController @RequestMapping("/api/v1/exhibits") public class ExhibitController {
 private final JdbcTemplate jdbc; ExhibitController(JdbcTemplate jdbc){this.jdbc=jdbc;}
 @GetMapping public ApiResponse<List<Card>> list(){return ApiResponse.ok(jdbc.query("select e.slug,e.title,e.summary,e.cover_image_url,a.slug artifact_slug,a.title artifact_title from exhibits_3d e join artifacts a on a.id=e.artifact_id where e.status='PUBLISHED' and e.deleted_at is null and a.status='PUBLISHED' and a.deleted_at is null order by e.published_at desc,e.id desc",(r,n)->new Card(r.getString("slug"),r.getString("title"),r.getString("summary"),r.getString("cover_image_url"),r.getString("artifact_slug"),r.getString("artifact_title"))),"exhibits");}
 @GetMapping("/{slug}") public ApiResponse<java.util.Map<String,Object>> detail(@PathVariable String slug){var r=jdbc.queryForMap("select e.slug,e.title,e.summary,e.description,e.model_url,e.model_format,e.model_size_bytes,e.cover_image_url,a.slug artifact_slug,a.title artifact_title from exhibits_3d e join artifacts a on a.id=e.artifact_id where e.slug=? and e.status='PUBLISHED' and e.deleted_at is null and a.status='PUBLISHED' and a.deleted_at is null",slug);return ApiResponse.ok(java.util.Map.of("slug",r.get("slug"),"title",r.get("title"),"summary",r.get("summary")==null?"":r.get("summary"),"description",r.get("description")==null?"":r.get("description"),"modelUrl",r.get("model_url"),"modelFormat",r.get("model_format"),"modelSizeBytes",r.get("model_size_bytes"),"coverImageUrl",r.get("cover_image_url")==null?"":r.get("cover_image_url"),"artifact",java.util.Map.of("slug",r.get("artifact_slug"),"title",r.get("artifact_title"))),"exhibit");} public record Card(String slug,String title,String summary,String coverImageUrl,String artifactSlug,String artifactTitle){}
}


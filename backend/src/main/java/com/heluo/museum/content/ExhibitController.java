package com.heluo.museum.content;

import com.heluo.museum.common.api.ApiResponse;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/exhibits")
public class ExhibitController {
    private final JdbcTemplate jdbc;

    ExhibitController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    public ApiResponse<List<Card>> list() {
        return ApiResponse.ok(jdbc.query(
                "select e.slug,e.title,e.summary,e.cover_image_url,e.display_no,e.source_credit,e.license_label,e.collection_location,"
                        + "a.slug artifact_slug,a.title artifact_title from exhibits_3d e join artifacts a on a.id=e.artifact_id join categories c on c.id=a.category_id "
                        + "where e.status='PUBLISHED' and e.deleted_at is null and a.status='PUBLISHED' and a.deleted_at is null and c.enabled=1 "
                        + "order by e.published_at desc,e.id desc",
                (rs, rowNum) -> new Card(rs.getString("slug"), rs.getString("title"), empty(rs.getString("summary")),
                        empty(rs.getString("cover_image_url")), empty(rs.getString("display_no")),
                        empty(rs.getString("source_credit")), empty(rs.getString("license_label")),
                        empty(rs.getString("collection_location")), rs.getString("artifact_slug"), rs.getString("artifact_title"))),
                "exhibits");
    }

    @GetMapping("/{slug}")
    public ApiResponse<Map<String, Object>> detail(@PathVariable String slug) {
        Map<String, Object> row = jdbc.queryForMap(
                "select e.slug,e.title,e.summary,e.description,e.model_url,e.model_format,e.model_size_bytes,e.mobile_model_url,e.mobile_model_size_bytes,e.cover_image_url,"
                        + "e.display_no,e.source_credit,e.source_url,e.license_label,e.collection_location,"
                        + "a.slug artifact_slug,a.title artifact_title from exhibits_3d e join artifacts a on a.id=e.artifact_id join categories c on c.id=a.category_id "
                        + "where e.slug=? and e.status='PUBLISHED' and e.deleted_at is null and a.status='PUBLISHED' and a.deleted_at is null and c.enabled=1",
                slug);
        Map<String, Object> exhibit = new HashMap<>();
        exhibit.put("slug", row.get("slug"));
        exhibit.put("title", row.get("title"));
        exhibit.put("summary", empty((String) row.get("summary")));
        exhibit.put("description", empty((String) row.get("description")));
        exhibit.put("modelUrl", row.get("model_url"));
        exhibit.put("modelFormat", row.get("model_format"));
        exhibit.put("modelSizeBytes", row.get("model_size_bytes"));
        exhibit.put("mobileModelUrl", row.get("mobile_model_url"));
        exhibit.put("mobileModelSizeBytes", row.get("mobile_model_size_bytes"));
        exhibit.put("coverImageUrl", empty((String) row.get("cover_image_url")));
        exhibit.put("displayNo", empty((String) row.get("display_no")));
        exhibit.put("sourceCredit", empty((String) row.get("source_credit")));
        exhibit.put("sourceUrl", empty((String) row.get("source_url")));
        exhibit.put("licenseLabel", empty((String) row.get("license_label")));
        exhibit.put("collectionLocation", empty((String) row.get("collection_location")));
        exhibit.put("artifact", Map.of("slug", row.get("artifact_slug"), "title", row.get("artifact_title")));
        return ApiResponse.ok(exhibit, "exhibit");
    }

    private static String empty(String value) {
        return value == null ? "" : value;
    }

    public record Card(String slug, String title, String summary, String coverImageUrl, String displayNo,
                       String sourceCredit, String licenseLabel, String collectionLocation,
                       String artifactSlug, String artifactTitle) { }
}
